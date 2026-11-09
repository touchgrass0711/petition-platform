import { campaignPhase, type CampaignSummary, type Phase } from "@/lib/campaign";
import { bucketize, dailyPoints, delta, hourlyPoints, periodTotals, rangeWindow, sumBetween, type DailyDoc, type Delta, type Range, type Unit } from "./range";

// Daily rollup docs + campaigns → everything the dashboard draws for one selection and range. Pure, no I/O.

export const TRAFFIC = ["views", "visitors", "sessions", "bounces", "durationSum"] as const;
export const BREAKDOWNS = ["referrers", "countries", "devices", "shares", "shareVisits"] as const;
const TOP = 6;
const DAY_MS = 86_400_000;

export type Series = { buckets: number[]; prev: number[] | null; current: number; previous: number | null; delta: Delta | null };
export type Summary = {
  range: Range;
  unit: Unit;
  step: number;
  starts: number[];
  end: number;
  timeZone: string;
  signatures: Series & { before: number };
  /** From daily docs; at hour buckets (≤ 7D) these are day totals at noon UTC, so the UI should prefer live data there. */
  traffic: Record<(typeof TRAFFIC)[number], Series>;
  funnel: { views: number; started: number; codeSent: number; verified: number; signed: number };
  breakdowns: Record<(typeof BREAKDOWNS)[number], [string, number][]>;
  campaign: (Pick<CampaignSummary, "slug" | "title" | "goal" | "milestones" | "signatureCount" | "goalReachedAt" | "startAt" | "endAt"> & {
    phase: Phase;
    pace: { avgPerDay: number; neededPerDay: number | null; projectedAt: string | null };
  }) | null;
  comparison: { slug: string; title: string; phase: Phase; current: number; previous: number | null; delta: Delta | null; visitors: number }[];
};

const docMs = (d: DailyDoc) => Date.parse(`${d.date}T12:00:00Z`);

function series(w: ReturnType<typeof rangeWindow>, prevW: ReturnType<typeof rangeWindow> | null, pts: ReturnType<typeof hourlyPoints>): Series {
  const { current, previous } = periodTotals(w, pts);
  return { buckets: bucketize(w, pts), prev: prevW && bucketize(prevW, pts), current, previous, delta: delta(current, previous) };
}

function mergeTop(docs: DailyDoc[], field: string): [string, number][] {
  const sum: Record<string, number> = {};
  for (const d of docs) for (const [k, v] of Object.entries((d[field] as Record<string, number>) ?? {})) sum[k] = (sum[k] ?? 0) + v;
  const other = sum.other ?? 0;
  delete sum.other;
  const sorted = Object.entries(sum).sort((a, b) => b[1] - a[1]);
  const rest = other + sorted.slice(TOP).reduce((s, [, v]) => s + v, 0);
  return rest > 0 ? [...sorted.slice(0, TOP), ["other", rest]] : sorted.slice(0, TOP);
}

export function summarize(opts: {
  campaigns: CampaignSummary[];
  docs: Map<string, DailyDoc[]>;
  selected: string | null; // null = all campaigns
  range: Range;
  now: number;
  timeZone: string;
}): Summary {
  const { campaigns, docs, selected, range, now, timeZone } = opts;
  const chosen = selected ? campaigns.filter((c) => c.slug === selected) : campaigns;
  const all = chosen.flatMap((c) => docs.get(c.slug) ?? []);
  const firstAt = chosen.length ? Math.min(...chosen.map((c) => Date.parse(c.startAt))) : now;
  const w = rangeWindow(range, now, timeZone, firstAt);
  const prevW = w.prev ? rangeWindow(range, w.prev.end, timeZone) : null;

  const sigPts = hourlyPoints(all);
  const inWindow = all.filter((d) => docMs(d) >= w.starts[0] && docMs(d) < w.end);
  const fsum = (k: string) => inWindow.reduce((s, d) => s + (((d.funnel as Record<string, number>) ?? {})[k] ?? 0), 0);

  const one = selected ? chosen[0] : null;
  let pace = null;
  if (one) {
    const avgPerDay = sumBetween(sigPts, now - 7 * DAY_MS, now) / 7;
    const remaining = Math.max(0, one.goal - one.signatureCount);
    const daysLeft = one.endAt ? (Date.parse(one.endAt) - now) / DAY_MS : null;
    pace = {
      avgPerDay,
      neededPerDay: daysLeft && daysLeft > 0 ? remaining / daysLeft : null,
      projectedAt: remaining > 0 && avgPerDay > 0 ? new Date(now + (remaining / avgPerDay) * DAY_MS).toISOString() : null,
    };
  }

  return {
    range,
    unit: w.unit,
    step: w.step,
    starts: w.starts,
    end: w.end,
    timeZone,
    signatures: { ...series(w, prevW, sigPts), before: sumBetween(sigPts, -Infinity, w.starts[0]) },
    traffic: Object.fromEntries(TRAFFIC.map((k) => [k, series(w, prevW, dailyPoints(all, k))])) as Summary["traffic"],
    funnel: {
      views: inWindow.reduce((s, d) => s + ((d.views as number) ?? 0), 0),
      started: fsum("started"),
      codeSent: fsum("codeSent"),
      verified: fsum("verified"),
      signed: sumBetween(sigPts, w.starts[0], w.end),
    },
    breakdowns: Object.fromEntries(BREAKDOWNS.map((k) => [k, mergeTop(inWindow, k)])) as Summary["breakdowns"],
    campaign: one && pace && {
      slug: one.slug, title: one.title, goal: one.goal, milestones: one.milestones, signatureCount: one.signatureCount,
      goalReachedAt: one.goalReachedAt, startAt: one.startAt, endAt: one.endAt, phase: campaignPhase(one, now), pace,
    },
    comparison: selected
      ? []
      : chosen.map((c) => {
          const d = docs.get(c.slug) ?? [];
          const t = periodTotals(w, hourlyPoints(d));
          return {
            slug: c.slug, title: c.title, phase: campaignPhase(c, now), current: t.current, previous: t.previous,
            delta: delta(t.current, t.previous), visitors: periodTotals(w, dailyPoints(d, "visitors")).current,
          };
        }),
  };
}
