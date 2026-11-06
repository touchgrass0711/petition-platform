import { describe, expect, it, vi } from "vitest";
import { seedCampaigns } from "@/data/seed";
import { allocate, sampleDocs } from "./sample";
import { summarize } from "./summary";
import type { DailyDoc } from "./range";

const NOW = Date.parse("2026-11-04T10:20:00Z");

describe("allocate", () => {
  it("splits exactly, proportionally", () => {
    expect(allocate(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(allocate(7, [0, 1])).toEqual([0, 7]);
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
  });
});

describe("sampleDocs", () => {
  const c = { slug: "save-park", startAt: "2026-06-01T00:00:00.000Z", endAt: null, signatureCount: 8452 };

  it("is deterministic and ends at the campaign's real count", () => {
    const a = sampleDocs(c, NOW);
    expect(sampleDocs(c, NOW)).toEqual(a);
    expect(a.reduce((s, d) => s + (d.sig as number), 0)).toBe(8452);
    const d = a[10];
    expect(Object.values(d.sigH!).reduce((s, v) => s + v, 0)).toBe(d.sig);
  });

  it("has no data before the start or for a scheduled campaign", () => {
    expect(sampleDocs({ ...c, startAt: "2026-12-01T00:00:00.000Z" }, NOW)).toEqual([]);
    expect(sampleDocs(c, NOW)[0].date).toBe("2026-06-01");
  });
});

describe("summarize", () => {
  const campaigns = seedCampaigns(NOW);
  const docs = new Map(campaigns.map((c) => [c.slug, sampleDocs(c, NOW)]));

  it("one campaign: series, funnel, breakdowns and pace", () => {
    const live = campaigns.find((c) => c.slug === "default")!;
    const s = summarize({ campaigns, docs, selected: "default", range: "7d", now: NOW, timeZone: live.timeZone });
    expect(s.signatures.buckets).toHaveLength(28);
    expect(s.signatures.prev).toHaveLength(28); // started 21 days ago: a full previous 7 days exists
    // …but not a full previous 30 days.
    expect(summarize({ campaigns, docs, selected: "default", range: "30d", now: NOW, timeZone: live.timeZone }).signatures.prev).toBeNull();
    // Everything before the window plus everything in it is the whole sample, which ends at the real count.
    expect(s.signatures.before + s.signatures.buckets.reduce((a, b) => a + b, 0)).toBe(live.signatureCount);
    expect(s.funnel.signed).toBeGreaterThan(0);
    expect(s.funnel.started).toBeGreaterThan(s.funnel.signed);
    expect(s.breakdowns.referrers.length).toBeLessThanOrEqual(7);
    expect(s.campaign?.pace.avgPerDay).toBeGreaterThan(0);
    expect(s.comparison).toEqual([]);
  });

  it("all campaigns: sums every campaign and lists each in the comparison", () => {
    const s = summarize({ campaigns, docs, selected: null, range: "7d", now: NOW, timeZone: "UTC" });
    expect(s.campaign).toBeNull();
    expect(s.comparison.map((r) => r.slug).sort()).toEqual(campaigns.map((c) => c.slug).sort());
    expect(s.signatures.current).toBe(s.comparison.reduce((a, r) => a + r.current, 0));
  });

  it("works with no data at all", () => {
    const empty = new Map<string, DailyDoc[]>();
    const s = summarize({ campaigns, docs: empty, selected: null, range: "24h", now: NOW, timeZone: "UTC" });
    expect(s.signatures.current).toBe(0);
    expect(s.breakdowns.countries).toEqual([]);
  });
});

describe("metrics API in Demo Mode", async () => {
  vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
  vi.mock("@/lib/server/admin-auth", () => ({
    guard: async (req: Request) => (req.headers.get("x-admin") === "1" ? null : Response.json({ error: "Unauthorized" }, { status: 401 })),
  }));
  const single = vi.hoisted(() => ({ slug: null as string | null }));
  vi.mock("@/lib/petition", async (real) => ({ ...(await real<object>()), singleModeSlug: async () => single.slug }));
  const { GET } = await import("@/app/api/admin/metrics/route");
  const get = (qs: string, admin = true) => GET(new Request(`http://x/api/admin/metrics?${qs}`, { headers: admin ? { "x-admin": "1" } : {} }));

  it("needs an admin and a valid campaign", async () => {
    expect((await get("", false)).status).toBe(401);
    expect((await get("campaign=Bad_Slug")).status).toBe(400);
    expect((await get("campaign=no-such-campaign")).status).toBe(404);
  });

  it("returns sample data for a range, with the campaign's zone", async () => {
    const res = await get("campaign=default&range=3m");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ sample: true, range: "3m", timeZone: "Asia/Jakarta" });
    expect(body.starts).toHaveLength(90);
    const all = await (await get("range=bogus&tz=Not/AZone")).json();
    expect(all).toMatchObject({ range: "7d", timeZone: "UTC" });
  });

  it("only ever shows the single campaign in single-campaign mode", async () => {
    single.slug = "default";
    try {
      for (const qs of ["campaign=all", "campaign=achieved-campaign", ""]) {
        const body = await (await get(qs)).json();
        expect(body.campaigns.map((c: { slug: string }) => c.slug)).toEqual(["default"]);
        expect(body.campaign.slug).toBe("default");
        expect(body.comparison.map((c: { slug: string }) => c.slug)).not.toContain("achieved-campaign");
      }
    } finally {
      single.slug = null;
    }
  });
});

describe("chart helpers", async () => {
  const { bucketLabel, deltaText, seriesRows } = await import("./chart");
  const H = 3_600_000;
  const t0 = Date.parse("2026-11-03T17:00:00Z"); // 00:00 next day in Jakarta

  it("labels buckets in the campaign's zone", () => {
    expect(bucketLabel(t0, "hour", "Asia/Jakarta")).toBe("00:00");
    expect(bucketLabel(t0, "day", "Asia/Jakarta")).toBe("4 Nov");
    expect(bucketLabel(t0, "hour", "Asia/Jakarta", true)).toBe("Wed 00:00");
  });

  it("builds per-bucket and cumulative rows", () => {
    const s = { buckets: [2, 3], prev: [1, 0], current: 5, previous: 1, delta: null, before: 10 };
    const per = seriesRows(s, [t0, t0 + H], "hour", "UTC");
    expect(per.map((r) => [r.current, r.previous])).toEqual([[2, 1], [3, 0]]);
    const cum = seriesRows(s, [t0, t0 + H], "hour", "UTC", true);
    expect(cum.map((r) => [r.current, r.previous])).toEqual([[12, null], [15, null]]);
  });

  it("writes deltas as text with a direction", () => {
    expect(deltaText(null)).toBeNull();
    expect(deltaText({ abs: 5, pct: null, isNew: true })).toEqual({ text: "New", dir: "up" });
    expect(deltaText({ abs: 0, pct: 0, isNew: false })).toEqual({ text: "No change", dir: "flat" });
    expect(deltaText({ abs: -20, pct: -12.34, isNew: false })).toEqual({ text: "−12%", dir: "down" });
    expect(deltaText({ abs: 3, pct: 4.56, isNew: false })).toEqual({ text: "+4.6%", dir: "up" });
  });
});
