import { describe, expect, it } from "vitest";
import { campaignPhase, isAchieved, utcToWallClock } from "@/lib/campaign";
import { campaignInputSchema } from "@/lib/campaign-schema";
import { commentInputSchema } from "@/lib/schemas";
import { seedCampaigns, seedComments, seedPetition } from "./seed";

describe("seed data", () => {
  it("has 10-20 comments that pass validation", () => {
    const comments = seedComments(0);
    expect(comments.length).toBeGreaterThanOrEqual(10);
    expect(comments.length).toBeLessThanOrEqual(20);
    for (const c of comments) expect(commentInputSchema.safeParse(c).success).toBe(true);
  });
  it("uses the demo signature count", () => {
    expect(seedPetition.signatureCount).toBe(8452);
  });
  it("has campaigns in every public state, one featured, all valid", () => {
    const now = Date.UTC(2026, 10, 2);
    const campaigns = seedCampaigns(now);
    const states = campaigns.map((c) => `${campaignPhase(c, now)}${isAchieved(c) ? "+achieved" : ""}`);
    expect(states).toEqual(["live+achieved", "live+achieved", "scheduled", "ended+achieved", "ended"]);
    // The featured one is the single-campaign demo, so it must show the Achieved badge.
    expect(campaigns.filter((c) => c.featured).map((c) => c.slug)).toEqual(["default"]);
    for (const c of campaigns) {
      expect(Date.parse(c.startAt) % 60_000).toBe(0);
      const input = {
        ...c,
        start: utcToWallClock(c.startAt, c.timeZone),
        end: c.endAt && utcToWallClock(c.endAt, c.timeZone),
      };
      expect(campaignInputSchema.safeParse(input).success).toBe(true);
    }
  });
});
