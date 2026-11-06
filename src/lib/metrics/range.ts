import { tz } from "@date-fns/tz";
import { addDays, addHours, addMonths, addWeeks, startOfDay, startOfHour, startOfMonth, startOfWeek, subMonths } from "date-fns";

export const RANGES = ["24h", "3d", "7d", "30d", "3m", "6m", "1y", "all"] as const;
export type Range = (typeof RANGES)[number];
export const DEFAULT_RANGE: Range = "7d";
export const RANGE_LABEL: Record<Range, string> = {
  "24h": "24h", "3d": "3D", "7d": "7D", "30d": "30D", "3m": "3M", "6m": "6M", "1y": "1Y", all: "All",
};

/** `?range=` value → a known range; anything else falls back to 7D. */
export const parseRange = (v: string | null | undefined): Range => (RANGES.includes(v as Range) ? (v as Range) : DEFAULT_RANGE);

export type Unit = "hour" | "day" | "week" | "month";
const SPECS: Record<Exclude<Range, "all">, { unit: Unit; step: number; count: number }> = {
  "24h": { unit: "hour", step: 1, count: 24 },
  "3d": { unit: "hour", step: 3, count: 24 },
  "7d": { unit: "hour", step: 6, count: 28 },
  "30d": { unit: "day", step: 1, count: 30 },
  "3m": { unit: "day", step: 1, count: 90 },
  "6m": { unit: "week", step: 1, count: 26 },
  "1y": { unit: "week", step: 1, count: 52 },
};
const ALL_MAX_BUCKETS = 600; // ~50 years of months; a bad start date can't build a huge array

export type Window = {
  range: Range;
  unit: Unit;
  step: number;
  /** Bucket start instants (ms), oldest first. The last bucket holds `now` and is partial. */
  starts: number[];
  /** Exclusive end of the last bucket. */
  end: number;
  /** Previous period lined up with starts[0] … starts[last] (complete buckets only); null when none exists. */
  prev: { start: number; end: number } | null;
};

type Ctx = ReturnType<typeof tz>;

function shift(unit: Unit, d: Date, n: number, ctx: Ctx): Date {
  switch (unit) {
    case "hour": return addHours(d, n); // absolute hours: equal-length buckets across DST
    case "day": return addDays(d, n, { in: ctx });
    case "week": return addWeeks(d, n, { in: ctx });
    case "month": return addMonths(d, n, { in: ctx });
  }
}

function floor(unit: Unit, step: number, d: Date, ctx: Ctx): Date {
  switch (unit) {
    case "hour": {
      const h = startOfHour(d, { in: ctx });
      return addHours(h, -(h.getHours() % step)); // 3h/6h buckets start at 00, 03, 06 … wall-clock
    }
    case "day": return startOfDay(d, { in: ctx });
    case "week": return startOfWeek(d, { in: ctx, weekStartsOn: 1 });
    case "month": return startOfMonth(d, { in: ctx });
  }
}

/**
 * Buckets for a range in `timeZone`. `firstAt` (campaign start or first data) sizes "All" and hides the
 * comparison when there is no full previous period.
 */
export function rangeWindow(range: Range, now: Date | number, timeZone: string, firstAt?: Date | number | null): Window {
  const ctx = tz(timeZone);
  const t = new Date(now);
  let unit: Unit, step: number, count: number;
  if (range === "all") {
    const first = new Date(firstAt ?? t);
    const from = first > t ? t : first;
    unit = from < subMonths(t, 6, { in: ctx }) ? "month" : "week";
    step = 1;
    const stop = floor(unit, 1, from, ctx).getTime();
    count = 1;
    for (let b = floor(unit, 1, t, ctx); b.getTime() > stop && count < ALL_MAX_BUCKETS; b = shift(unit, b, -1, ctx)) count++;
  } else {
    ({ unit, step, count } = SPECS[range]);
  }
  const last = floor(unit, step, t, ctx);
  const starts = Array.from({ length: count }, (_, i) => shift(unit, last, -(count - 1 - i) * step, ctx).getTime());
  const end = shift(unit, last, step, ctx).getTime();
  let prev: Window["prev"] = null;
  if (range !== "all") {
    const prevStart = shift(unit, new Date(starts[0]), -count * step, ctx).getTime();
    const prevEnd = shift(unit, last, -count * step, ctx).getTime();
    if (firstAt == null || new Date(firstAt).getTime() <= prevStart) prev = { start: prevStart, end: prevEnd };
  }
  return { range, unit, step, starts, end, prev };
}

export type Point = [ms: number, value: number];

/** Sums points into the window's buckets; points outside the window are ignored. */
export function bucketize(w: Window, points: Point[]): number[] {
  const out = new Array<number>(w.starts.length).fill(0);
  for (const [ms, v] of points) {
    if (ms < w.starts[0] || ms >= w.end) continue;
    let lo = 0;
    let hi = w.starts.length - 1; // find the last start <= ms
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (w.starts[mid] <= ms) lo = mid;
      else hi = mid - 1;
    }
    out[lo] += v;
  }
  return out;
}

export const sumBetween = (points: Point[], from: number, to: number) =>
  points.reduce((s, [ms, v]) => (ms >= from && ms < to ? s + v : s), 0);

/** Current vs previous over complete buckets only (the partial current bucket is left out). */
export function periodTotals(w: Window, points: Point[]) {
  const current = sumBetween(points, w.starts[0], w.starts[w.starts.length - 1]);
  return { current, previous: w.prev ? sumBetween(points, w.prev.start, w.prev.end) : null };
}

export type Delta = { abs: number; pct: number | null; isNew: boolean };

/** null when there is nothing to compare with; previous 0 and current > 0 reads as "new". */
export function delta(current: number, previous: number | null): Delta | null {
  if (previous === null) return null;
  return { abs: current - previous, pct: previous > 0 ? ((current - previous) / previous) * 100 : null, isNew: previous === 0 && current > 0 };
}

export type DailyDoc = { date: string; sigH?: Record<string, number> } & Record<string, unknown>;

/** Signature points at UTC-hour precision from `daily/{YYYY-MM-DD}.sigH`. */
export const hourlyPoints = (docs: DailyDoc[]): Point[] =>
  docs.flatMap((d) => Object.entries(d.sigH ?? {}).map(([h, v]): Point => [Date.parse(`${d.date}T${h.padStart(2, "0")}:00:00Z`), v]));

/**
 * Daily-only fields (traffic) as one point per UTC day.
 * shortcut: placed at 12:00 UTC, so day buckets in zones far from UTC can be off by a day; upgrade by storing hourly traffic.
 */
export const dailyPoints = (docs: DailyDoc[], field: string): Point[] =>
  docs.flatMap((d) => (typeof d[field] === "number" ? [[Date.parse(`${d.date}T12:00:00Z`), d[field] as number] as Point] : []));
