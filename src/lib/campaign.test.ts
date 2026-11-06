import { describe, expect, it } from "vitest";
import { campaignPhase, canSign, goalReachedAfterEdit, reachesGoal, isIanaZone, milestoneLadder, utcToWallClock, wallClockToUtc } from "./campaign";
import { campaignInputSchema, docToText, richTextDocSchema } from "./campaign-schema";

const base = {
  status: "published" as const,
  startAt: "2026-11-10T12:00:00.000Z",
  endAt: "2026-11-20T12:00:00.000Z" as string | null,
  deletedAt: null as string | null,
};
const at = (iso: string) => Date.parse(iso);

describe("campaignPhase", () => {
  it("is scheduled before start, live from start, ended at end", () => {
    expect(campaignPhase(base, at("2026-11-10T11:59:59.999Z"))).toBe("scheduled");
    expect(campaignPhase(base, at("2026-11-10T12:00:00.000Z"))).toBe("live");
    expect(campaignPhase(base, at("2026-11-20T11:59:59.999Z"))).toBe("live");
    expect(campaignPhase(base, at("2026-11-20T12:00:00.000Z"))).toBe("ended");
  });
  it("never ends when Indefinitely", () => {
    expect(campaignPhase({ ...base, endAt: null }, at("2100-01-01T00:00:00Z"))).toBe("live");
  });
  it("treats drafts and deleted campaigns as draft, whatever the dates", () => {
    expect(campaignPhase({ ...base, status: "draft" }, at("2026-11-15T00:00:00Z"))).toBe("draft");
    expect(campaignPhase({ ...base, deletedAt: "2026-11-12T00:00:00Z" }, at("2026-11-15T00:00:00Z"))).toBe("draft");
  });
  it("fails closed on bad dates", () => {
    expect(canSign({ ...base, startAt: "nope" }, at("2026-11-15T00:00:00Z"))).toBe(false);
    expect(canSign({ ...base, endAt: "nope" }, at("2026-11-15T00:00:00Z"))).toBe(false);
  });
  it("only Live can sign", () => {
    expect(canSign(base, at("2026-11-15T00:00:00Z"))).toBe(true);
    expect(canSign(base, at("2026-11-25T00:00:00Z"))).toBe(false);
  });
});

describe("reachesGoal", () => {
  it("is true only for the signature that reaches the goal, once", () => {
    expect(reachesGoal({ signatureCount: 8, goal: 10, goalReachedAt: null })).toBe(false);
    expect(reachesGoal({ signatureCount: 9, goal: 10, goalReachedAt: null })).toBe(true);
    expect(reachesGoal({ signatureCount: 10, goal: 10, goalReachedAt: "2026-11-01T00:00:00Z" })).toBe(false);
    // Already past the goal but never recorded (older docs, or goal lowered): the next signature records it.
    expect(reachesGoal({ signatureCount: 50, goal: 10, goalReachedAt: null })).toBe(true);
  });
});

describe("goalReachedAfterEdit", () => {
  const now = "2026-11-02T00:00:00.000Z";
  it("records, keeps or clears the reached date when the goal changes", () => {
    expect(goalReachedAfterEdit({ signatureCount: 120, goalReachedAt: null }, 100, now)).toBe(now);
    expect(goalReachedAfterEdit({ signatureCount: 120, goalReachedAt: "2026-10-01T00:00:00Z" }, 100, now)).toBe("2026-10-01T00:00:00Z");
    expect(goalReachedAfterEdit({ signatureCount: 120, goalReachedAt: "2026-10-01T00:00:00Z" }, 500, now)).toBeNull();
    expect(goalReachedAfterEdit({ signatureCount: 100, goalReachedAt: null }, 100, now)).toBe(now);
  });
});

describe("time zones", () => {
  it("reads wall-clock time in the campaign zone", () => {
    expect(wallClockToUtc("2026-11-10T19:00", "Asia/Jakarta").toISOString()).toBe("2026-11-10T12:00:00.000Z");
    expect(wallClockToUtc("2026-11-10T19:00", "Asia/Kolkata").toISOString()).toBe("2026-11-10T13:30:00.000Z");
    expect(wallClockToUtc("2026-07-01T09:00", "America/New_York").toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(wallClockToUtc("2026-12-01T09:00", "America/New_York").toISOString()).toBe("2026-12-01T14:00:00.000Z");
  });
  it("resolves a DST gap forward", () => {
    expect(wallClockToUtc("2026-03-08T02:30", "America/New_York").toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });
  it("round-trips", () => {
    for (const zone of ["Asia/Jakarta", "Europe/London", "America/Los_Angeles", "Australia/Adelaide"]) {
      expect(utcToWallClock(wallClockToUtc("2026-10-04T08:15", zone), zone)).toBe("2026-10-04T08:15");
    }
  });
  it("rejects malformed input and non-IANA zones", () => {
    expect(() => wallClockToUtc("2026-11-10 19:00", "UTC")).toThrow();
    expect(isIanaZone("Asia/Jakarta")).toBe(true);
    expect(isIanaZone("UTC")).toBe(true);
    expect(isIanaZone("Mars/Olympus")).toBe(false);
    expect(isIanaZone("+07:00")).toBe(false);
  });
});

describe("milestoneLadder", () => {
  it("follows the agreed ladder up to the goal", () => {
    expect(milestoneLadder(10_000).map((m) => m.count)).toEqual([
      50, 75, 125, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10000,
    ]);
    expect(milestoneLadder(250).map((m) => m.count)).toEqual([50, 75, 125, 200]);
    expect(milestoneLadder(10)).toEqual([]);
  });
  it("keeps at most 20, the highest", () => {
    const big = milestoneLadder(100_000_000);
    expect(big).toHaveLength(20);
    expect(big.at(-1)!.count).toBe(100_000_000);
  });
});

const doc = (...content: unknown[]) => ({ type: "doc", content });
const p = (...content: unknown[]) => ({ type: "paragraph", content });

describe("richTextDocSchema", () => {
  it("accepts StarterKit content and strips unknown attributes", () => {
    const parsed = richTextDocSchema.parse(
      doc(
        { type: "heading", attrs: { level: 2, class: "x" }, content: [{ type: "text", text: "Why" }] },
        p({ type: "text", text: "Read ", marks: [{ type: "bold" }] }, {
          type: "text",
          text: "this",
          marks: [{ type: "link", attrs: { href: "https://example.com", onclick: "alert(1)", target: "_self" } }],
        }),
      ),
    );
    expect(parsed.content![0].attrs).toEqual({ level: 2 });
    expect(parsed.content![1].content![1].marks).toEqual([{ type: "link", attrs: { href: "https://example.com" } }]);
  });
  it("rejects unsafe links, unknown nodes and marks", () => {
    const link = (href: string) => doc(p({ type: "text", text: "x", marks: [{ type: "link", attrs: { href } }] }));
    expect(richTextDocSchema.safeParse(link("javascript:alert(1)")).success).toBe(false);
    expect(richTextDocSchema.safeParse(link("JaVaScRiPt:alert(1)")).success).toBe(false);
    expect(richTextDocSchema.safeParse(link("data:text/html,<script>")).success).toBe(false);
    expect(richTextDocSchema.safeParse(link("/relative")).success).toBe(false);
    expect(richTextDocSchema.safeParse(link("mailto:a@b.co")).success).toBe(true);
    expect(richTextDocSchema.safeParse(doc({ type: "image", attrs: { src: "x" } })).success).toBe(false);
    expect(richTextDocSchema.safeParse(doc(p({ type: "text", text: "x", marks: [{ type: "highlight" }] }))).success).toBe(false);
    expect(richTextDocSchema.safeParse(p({ type: "text", text: "x" })).success).toBe(false);
  });
  it("rejects oversized or deeply nested documents", () => {
    const big = Array.from({ length: 7 }, () => p({ type: "text", text: "a".repeat(9_000) }));
    expect(richTextDocSchema.safeParse(doc(...big)).success).toBe(false);
    let deep: unknown = { type: "paragraph" };
    for (let i = 0; i < 50; i++) deep = { type: "blockquote", content: [deep] };
    expect(richTextDocSchema.safeParse(doc(deep)).success).toBe(false);
  });
  it("derives plain text", () => {
    const d = doc(
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title" }] },
      p({ type: "text", text: "One" }, { type: "hardBreak" }, { type: "text", text: "two" }),
    );
    expect(docToText(richTextDocSchema.parse(d))).toBe("Title\nOne\ntwo");
  });
});

describe("campaignInputSchema", () => {
  const valid = {
    slug: "clean-river",
    title: " Campaign Title ",
    description: doc(p({ type: "text", text: "Hi" })),
    goal: 1000,
    milestones: [{ count: 50 }, { count: 500, label: "Halfway" }],
    start: "2026-11-10T19:00",
    end: "2026-11-30T19:00",
    timeZone: "Asia/Jakarta",
  };
  it("accepts a valid campaign and applies defaults", () => {
    const v = campaignInputSchema.parse(valid);
    expect(v.title).toBe("Campaign Title");
    expect(v.status).toBe("draft");
    expect(v.milestones[0].label).toBe("");
  });
  it("reports malformed dates as issues instead of throwing", () => {
    const r = campaignInputSchema.safeParse({ ...valid, title: "", end: "T", timeZone: "Nowhere/City" });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(["title", "end", "timeZone"]));
  });
  it("accepts Indefinitely", () => {
    expect(campaignInputSchema.safeParse({ ...valid, end: null }).success).toBe(true);
  });
  it.each([
    ["bad slug", { slug: "-bad" }],
    ["uppercase slug", { slug: "Bad-Slug" }],
    ["blank title", { title: "  " }],
    ["end before start", { end: "2026-11-10T18:59" }],
    ["unknown zone", { timeZone: "Mars/Olympus" }],
    ["milestone above goal", { milestones: [{ count: 2000 }] }],
    ["milestones out of order", { milestones: [{ count: 500 }, { count: 50 }] }],
    ["duplicate milestones", { milestones: [{ count: 50 }, { count: 50 }] }],
    ["zero goal", { goal: 0 }],
  ])("rejects %s", (_, patch) => {
    expect(campaignInputSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});
