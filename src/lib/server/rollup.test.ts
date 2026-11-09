import { describe, expect, it } from "vitest";
import { buildDocs, cronAuthorized, mapKey, nextChunk, queriesFor, topN, type Results } from "./rollup";

const NOW = Date.parse("2026-11-02T00:30:00Z"); // cron time; yesterday = 2026-11-01

describe("cronAuthorized", () => {
  it("accepts only the exact bearer secret", () => {
    expect(cronAuthorized("Bearer s3cret", "s3cret")).toBe(true);
    expect(cronAuthorized("Bearer s3cre", "s3cret")).toBe(false);
    expect(cronAuthorized("s3cret", "s3cret")).toBe(false);
    expect(cronAuthorized(null, "s3cret")).toBe(false);
  });
});

describe("nextChunk", () => {
  it("backfills a year in 30-day chunks, then one day at a time", () => {
    expect(nextChunk(null, NOW)).toEqual({ from: "2025-11-02", to: "2025-12-02" });
    expect(nextChunk("2026-10-20", NOW)).toEqual({ from: "2026-10-21", to: "2026-11-02" });
    expect(nextChunk("2026-10-31", NOW)).toEqual({ from: "2026-11-01", to: "2026-11-02" });
    expect(nextChunk("2026-11-01", NOW)).toBeNull();
  });

  it("restarts the backfill window when progress is missing, malformed or too old", () => {
    expect(nextChunk("junk", NOW)?.from).toBe("2025-11-02");
    expect(nextChunk("2020-01-01", NOW)?.from).toBe("2025-11-02");
  });
});

describe("queriesFor", () => {
  it("refuses anything but plain days, so nothing else reaches the query text", () => {
    expect(() => queriesFor("2026-11-01' OR 1=1 --", "2026-11-02")).toThrow();
    expect(queriesFor("2026-11-01", "2026-11-02").core).toContain("toDateTime('2026-11-01 00:00:00', 'UTC')");
    const b = queriesFor("2026-11-01", "2026-11-02").breakdowns;
    expect(b.shareVisits).toContain("properties.utm_medium = 'share'");
    expect(b.referrers).not.toContain("utm_medium");
  });
});

describe("topN and mapKey", () => {
  it("keeps the 10 largest and folds the rest into other", () => {
    const counts = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`k${i}`, i + 1]));
    const out = topN(counts);
    expect(Object.keys(out)).toHaveLength(11);
    expect(out.other).toBe(1 + 2 + 3);
    expect(out.k12).toBe(13);
  });

  it("makes safe Firestore map keys", () => {
    expect(mapKey("x.com")).toBe("x.com");
    expect(mapKey("__name__")).toBe("name");
    expect(mapKey("")).toBe("unknown");
    expect(mapKey(null)).toBe("unknown");
    expect(mapKey("a".repeat(300))).toHaveLength(100);
  });
});

describe("buildDocs", () => {
  const r: Results = {
    core: [
      ["2026-11-01", "save-park", 120, 80, 90, 20, 12, 10],
      ["2026-11-01", "no-such-campaign", 999, 999, 999, 0, 0, 0],
      ["garbage", "save-park", 1, 1, 1, 0, 0, 0],
    ],
    sessions: [["2026-11-01", "save-park", 30, 5400]],
    breakdowns: {
      referrers: [["2026-11-01", "save-park", "x.com", 70], ["2026-11-01", "save-park", null, 50]],
      countries: [["2026-11-01", "save-park", "ID", 100]],
      devices: [],
      shares: [["2026-11-01", "save-park", "whatsapp", "4"]],
      shareVisits: [["2026-11-01", "save-park", "whatsapp", 9]],
    },
  };

  it("builds one doc per existing campaign and day, dropping unknown slugs and bad days", () => {
    const docs = buildDocs(r, new Set(["save-park"]));
    expect([...docs.keys()]).toEqual(["save-park/2026-11-01"]);
    expect(docs.get("save-park/2026-11-01")).toEqual({
      views: 120, visitors: 80, sessions: 90, bounces: 30, durationSum: 5400,
      funnel: { started: 20, codeSent: 12, verified: 10 },
      referrers: { "x.com": 70, unknown: 50 },
      countries: { ID: 100 },
      devices: {},
      shares: { whatsapp: 4 },
      shareVisits: { whatsapp: 9 },
    });
  });

  it("gives the same output on a rerun (idempotent input → output)", () => {
    const slugs = new Set(["save-park"]);
    expect(buildDocs(r, slugs)).toEqual(buildDocs(r, slugs));
  });
});
