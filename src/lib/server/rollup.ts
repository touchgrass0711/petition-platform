import "server-only";
import { timingSafeEqual } from "node:crypto";

// PostHog traffic → petitions/{slug}/daily/{YYYY-MM-DD} (UTC days). Pure parts here; the cron route does I/O.

export const TOP_N = 10;
export const CHUNK_DAYS = 30;
export const BACKFILL_DAYS = 365;
/** HogQL defaults to 100 rows; ask for the maximum and treat a full page as possibly cut off. */
export const ROW_LIMIT = 10_000;

export type Counts = Record<string, number>;
export type DayFields = {
  views: number;
  visitors: number;
  sessions: number;
  bounces: number;
  durationSum: number;
  funnel: { started: number; codeSent: number; verified: number };
  referrers: Counts;
  countries: Counts;
  devices: Counts;
  shares: Counts;
};
/** Replaced wholesale on every run (set + mergeFields), so reruns are idempotent and sig/sigH are untouched. */
export const ROLLUP_FIELDS = ["views", "visitors", "sessions", "bounces", "durationSum", "funnel", "referrers", "countries", "devices", "shares"] as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (day: string, n: number) => utcDay(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS);

/** Constant-time check of Vercel Cron's `Authorization: Bearer <CRON_SECRET>`. */
export function cronAuthorized(header: string | null, secret: string): boolean {
  const got = Buffer.from(header ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Next [from, to) span of whole UTC days to roll up, or null when caught up to yesterday. */
export function nextChunk(lastDay: string | null, now: number): { from: string; to: string } | null {
  const yesterday = utcDay(now - DAY_MS);
  const oldest = addDays(yesterday, -(BACKFILL_DAYS - 1));
  const from = lastDay && DAY.test(lastDay) && lastDay >= oldest ? addDays(lastDay, 1) : oldest;
  if (from > yesterday) return null;
  const end = addDays(from, CHUNK_DAYS);
  const today = addDays(yesterday, 1);
  return { from, to: end < today ? end : today };
}

const SLUG = (col: string) => `extract(${col}, '^/c/([a-z0-9-]+)')`;
const DAY_OF = (col: string) => `toDate(toTimeZone(${col}, 'UTC'))`;
const IN_SPAN = (col: string, from: string, to: string) =>
  `${col} >= toDateTime('${from} 00:00:00', 'UTC') AND ${col} < toDateTime('${to} 00:00:00', 'UTC')`;

const BREAKDOWNS = {
  referrers: { event: "$pageview", value: "properties.$referring_domain", none: "$direct" },
  countries: { event: "$pageview", value: "properties.$geoip_country_code", none: "unknown" },
  devices: { event: "$pageview", value: "properties.$device_type", none: "unknown" },
  shares: { event: "share_clicked", value: "properties.channel", none: "unknown" },
} as const;
type Breakdown = keyof typeof BREAKDOWNS;

/** The six HogQL queries for one span. Days are validated, so nothing user-supplied reaches the query text. */
export function queriesFor(from: string, to: string) {
  if (!DAY.test(from) || !DAY.test(to)) throw new Error("Invalid rollup span");
  const span = IN_SPAN("timestamp", from, to);
  const core = `SELECT ${DAY_OF("timestamp")} AS d, ${SLUG("properties.$pathname")} AS s,
    countIf(event = '$pageview'), uniqIf(person_id, event = '$pageview'), uniqIf(properties.$session_id, event = '$pageview'),
    countIf(event = 'sign_started'), countIf(event = 'code_sent'), countIf(event = 'code_verified')
    FROM events WHERE ${span} AND event IN ('$pageview', 'sign_started', 'code_sent', 'code_verified')
    GROUP BY d, s HAVING s != '' LIMIT ${ROW_LIMIT}`;
  const sessions = `SELECT ${DAY_OF("$start_timestamp")} AS d, ${SLUG("$entry_pathname")} AS s, countIf($is_bounce), sum($session_duration)
    FROM sessions WHERE ${IN_SPAN("$start_timestamp", from, to)} GROUP BY d, s HAVING s != '' LIMIT ${ROW_LIMIT}`;
  const breakdowns = Object.fromEntries(
    Object.entries(BREAKDOWNS).map(([k, b]) => [
      k,
      `SELECT ${DAY_OF("timestamp")} AS d, ${SLUG("properties.$pathname")} AS s, coalesce(${b.value}, '${b.none}') AS v, count() AS c
       FROM events WHERE ${span} AND event = '${b.event}' GROUP BY d, s, v HAVING s != '' ORDER BY c DESC LIMIT ${ROW_LIMIT}`,
    ]),
  ) as Record<Breakdown, string>;
  return { core, sessions, breakdowns };
}

export type Results = { core: unknown[][]; sessions: unknown[][]; breakdowns: Record<Breakdown, unknown[][]> };

const empty = (): DayFields => ({
  views: 0, visitors: 0, sessions: 0, bounces: 0, durationSum: 0,
  funnel: { started: 0, codeSent: 0, verified: 0 },
  referrers: {}, countries: {}, devices: {}, shares: {},
});
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const dayOf = (v: unknown) => String(v ?? "").slice(0, 10);

/** Firestore map keys: no empty keys, nothing that looks like a reserved `__name__`, bounded length. */
export const mapKey = (v: unknown) => {
  const k = String(v ?? "").trim().slice(0, 100).replace(/^_+|_+$/g, "");
  return k || "unknown";
};

/** Keeps the TOP_N largest values and folds the rest into "other". */
export function topN(counts: Counts): Counts {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const out = Object.fromEntries(sorted.slice(0, TOP_N));
  const rest = sorted.slice(TOP_N).reduce((s, [, c]) => s + c, 0);
  if (rest > 0) out.other = (out.other ?? 0) + rest;
  return out;
}

/** Query rows → one DayFields per existing campaign and day. Paths of unknown slugs are dropped, so junk URLs create no docs. */
export function buildDocs(r: Results, slugs: Set<string>): Map<string, DayFields> {
  const docs = new Map<string, DayFields>();
  const at = (d: unknown, s: unknown) => {
    const slug = String(s ?? "");
    const day = dayOf(d);
    if (!slugs.has(slug) || !DAY.test(day)) return null;
    const key = `${slug}/${day}`;
    if (!docs.has(key)) docs.set(key, empty());
    return docs.get(key)!;
  };
  for (const [d, s, views, visitors, sessions, started, codeSent, verified] of r.core) {
    const f = at(d, s);
    if (!f) continue;
    Object.assign(f, { views: num(views), visitors: num(visitors), sessions: num(sessions) });
    f.funnel = { started: num(started), codeSent: num(codeSent), verified: num(verified) };
  }
  for (const [d, s, bounces, duration] of r.sessions) {
    const f = at(d, s);
    if (f) Object.assign(f, { bounces: num(bounces), durationSum: num(duration) });
  }
  for (const k of Object.keys(BREAKDOWNS) as Breakdown[]) {
    for (const [d, s, v, c] of r.breakdowns[k]) {
      const f = at(d, s);
      if (!f) continue;
      const key = mapKey(v);
      f[k][key] = (f[k][key] ?? 0) + num(c);
    }
  }
  for (const f of docs.values()) for (const k of Object.keys(BREAKDOWNS) as Breakdown[]) f[k] = topN(f[k]);
  return docs;
}

/** Runs the queries one after another (the PostHog query budget is shared organisation-wide). */
export async function fetchResults(query: (q: string) => Promise<unknown[][]>, from: string, to: string): Promise<Results> {
  const q = queriesFor(from, to);
  const core = await query(q.core);
  const sessions = await query(q.sessions);
  const breakdowns = {} as Record<Breakdown, unknown[][]>;
  for (const k of Object.keys(q.breakdowns) as Breakdown[]) breakdowns[k] = await query(q.breakdowns[k]);
  // shortcut: a full page may mean missing rows; logged rather than paged. Upgrade with OFFSET paging if it ever fires.
  for (const [name, rows] of [["core", core], ["sessions", sessions], ...Object.entries(breakdowns)] as const)
    if (rows.length >= ROW_LIMIT) console.warn(`rollup: ${name} hit ${ROW_LIMIT} rows for ${from}..${to}`);
  return { core, sessions, breakdowns };
}
