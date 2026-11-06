import { describe, expect, it } from "vitest";
import { bucketize, dailyPoints, delta, hourlyPoints, parseRange, periodTotals, rangeWindow, type Point } from "./range";

const JKT = "Asia/Jakarta"; // UTC+7, no DST
const NOW = Date.parse("2026-11-04T10:20:00Z"); // Wed 17:20 in Jakarta
const H = 3_600_000;

describe("parseRange", () => {
  it("accepts known ranges and falls back to 7D", () => {
    expect(parseRange("30d")).toBe("30d");
    expect(parseRange("1d")).toBe("7d");
    expect(parseRange(null)).toBe("7d");
  });
});

describe("rangeWindow", () => {
  it("24h: 24 hourly buckets, the last one holding now", () => {
    const w = rangeWindow("24h", NOW, JKT);
    expect(w.starts).toHaveLength(24);
    expect(w.starts.at(-1)).toBe(Date.parse("2026-11-04T10:00:00Z"));
    expect(w.end).toBe(Date.parse("2026-11-04T11:00:00Z"));
    expect(w.prev).toEqual({ start: w.starts[0] - 24 * H, end: w.starts[23] - 24 * H });
  });

  it("3D and 7D align 3h/6h buckets to the zone's wall clock", () => {
    const w3 = rangeWindow("3d", NOW, JKT);
    expect(w3.starts).toHaveLength(24);
    expect(new Date(w3.starts.at(-1)!).toISOString()).toBe("2026-11-04T08:00:00.000Z"); // 15:00 Jakarta
    const w7 = rangeWindow("7d", NOW, JKT);
    expect(w7.starts).toHaveLength(28);
    expect(new Date(w7.starts.at(-1)!).toISOString()).toBe("2026-11-04T05:00:00.000Z"); // 12:00 Jakarta
  });

  it("30D days start at the zone's midnight; 6M weeks start on Monday", () => {
    const d = rangeWindow("30d", NOW, JKT);
    expect(d.starts).toHaveLength(30);
    expect(new Date(d.starts.at(-1)!).toISOString()).toBe("2026-11-03T17:00:00.000Z"); // 4 Nov 00:00 Jakarta
    const w = rangeWindow("6m", NOW, JKT);
    expect(w.starts).toHaveLength(26);
    expect(new Date(w.starts.at(-1)!).toISOString()).toBe("2026-11-01T17:00:00.000Z"); // Mon 2 Nov 00:00 Jakarta
  });

  it("keeps buckets equal and increasing across a DST change", () => {
    const w = rangeWindow("3d", Date.parse("2026-11-02T15:00:00Z"), "America/New_York"); // DST ended 1 Nov
    const gaps = new Set(w.starts.slice(1).map((s, i) => s - w.starts[i]));
    expect([...gaps]).toEqual([3 * H]);
  });

  it("hides the comparison when the campaign is younger than the previous period", () => {
    expect(rangeWindow("7d", NOW, JKT, NOW - 10 * 24 * H).prev).toBeNull();
    expect(rangeWindow("7d", NOW, JKT, NOW - 30 * 24 * H).prev).not.toBeNull();
  });

  it("All: weekly under 6 months, monthly after, never compared", () => {
    const young = rangeWindow("all", NOW, JKT, NOW - 40 * 24 * H);
    expect(young.unit).toBe("week");
    expect(young.prev).toBeNull();
    const old = rangeWindow("all", NOW, JKT, Date.parse("2025-01-15T00:00:00Z"));
    expect(old.unit).toBe("month");
    expect(old.starts).toHaveLength(23); // Jan 2025 … Nov 2026
    expect(rangeWindow("all", NOW, JKT, null).starts).toHaveLength(1);
  });
});

describe("bucketize and totals", () => {
  const w = rangeWindow("24h", NOW, JKT);
  const pts: Point[] = [
    [w.starts[0], 2], // first bucket
    [w.starts[5] + 59 * 60_000, 3], // end of bucket 5
    [w.starts[23] + 60_000, 7], // partial current bucket
    [w.starts[0] - 2 * H, 100], // before the window, in the previous period's complete buckets
    [w.end, 100], // after the window
  ];

  it("puts each point in its bucket and drops points outside", () => {
    const b = bucketize(w, pts);
    expect(b[0]).toBe(2);
    expect(b[5]).toBe(3);
    expect(b[23]).toBe(7);
    expect(b.reduce((a, c) => a + c, 0)).toBe(12);
  });

  it("leaves the partial bucket out of the comparison", () => {
    expect(periodTotals(w, pts)).toEqual({ current: 5, previous: 100 });
  });
});

describe("delta", () => {
  it("formats gains, losses, new and no comparison", () => {
    expect(delta(110, 100)).toEqual({ abs: 10, pct: 10, isNew: false });
    expect(delta(50, 100)).toEqual({ abs: -50, pct: -50, isNew: false });
    expect(delta(5, 0)).toEqual({ abs: 5, pct: null, isNew: true });
    expect(delta(0, 0)).toEqual({ abs: 0, pct: null, isNew: false });
    expect(delta(5, null)).toBeNull();
  });
});

describe("rollup points", () => {
  it("reads UTC hours from sigH and noon for daily fields", () => {
    const docs = [{ date: "2026-11-03", sig: 3, sigH: { "07": 2, "23": 1 }, views: 40 }];
    expect(hourlyPoints(docs).sort((a, b) => a[0] - b[0])).toEqual([
      [Date.parse("2026-11-03T07:00:00Z"), 2],
      [Date.parse("2026-11-03T23:00:00Z"), 1],
    ]);
    expect(dailyPoints(docs, "views")).toEqual([[Date.parse("2026-11-03T12:00:00Z"), 40]]);
    expect(dailyPoints(docs, "visitors")).toEqual([]);
  });
});
