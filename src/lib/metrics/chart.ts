import { tz } from "@date-fns/tz";
import { format } from "date-fns";
import type { Delta, Unit } from "./range";
import type { Series } from "./summary";

// Pure helpers that turn the metrics API's buckets into chart rows and readable text.

const PATTERN: Record<Unit, string> = { hour: "HH:mm", day: "d MMM", week: "d MMM", month: "MMM yyyy" };

/** Bucket start as wall-clock text in the campaign's zone; multi-day hour ranges get the weekday. */
export function bucketLabel(ms: number, unit: Unit, timeZone: string, multiDay = false) {
  return format(ms, unit === "hour" && multiDay ? "EEE HH:mm" : PATTERN[unit], { in: tz(timeZone) });
}

export type Row = { t: number; label: string; current: number; previous: number | null };

/** One row per bucket. Cumulative adds everything before the window, so the line ends at the running total. */
export function seriesRows(
  s: Series & { before?: number },
  starts: number[],
  unit: Unit,
  timeZone: string,
  cumulative = false,
): Row[] {
  const multiDay = unit === "hour" && starts.length > 1 && starts[starts.length - 1] - starts[0] >= 86_400_000;
  let cur = cumulative ? (s.before ?? 0) : 0;
  return starts.map((t, i) => {
    cur = cumulative ? cur + (s.buckets[i] ?? 0) : (s.buckets[i] ?? 0);
    // The previous period is drawn per bucket only; a cumulative overlay would start from a different total.
    return { t, label: bucketLabel(t, unit, timeZone, multiDay), current: cur, previous: s.prev && !cumulative ? (s.prev[i] ?? 0) : null };
  });
}

/** "+12% vs previous", "New", "No change"; null when there is no previous period. Never colour alone. */
export function deltaText(d: Delta | null): { text: string; dir: "up" | "down" | "flat" } | null {
  if (!d) return null;
  if (d.isNew) return { text: "New", dir: "up" };
  if (d.abs === 0) return { text: "No change", dir: "flat" };
  const dir = d.abs > 0 ? "up" : "down";
  const size = d.pct === null ? Math.abs(d.abs).toLocaleString("en-US") : `${Math.abs(d.pct) < 10 ? Math.abs(d.pct).toFixed(1) : Math.round(Math.abs(d.pct))}%`;
  return { text: `${d.abs > 0 ? "+" : "−"}${size}`, dir };
}

export const ratio = (num: number, den: number) => (den > 0 ? (num / den) * 100 : null);
