import { describe, expect, it } from "vitest";
import { seedCampaigns } from "@/data/seed";
import { campaignInputSchema } from "./campaign-schema";
import { slugify, soon, toFormValues, toInput } from "./campaign-form";

describe("campaign form mapping", () => {
  it("round-trips a stored campaign through the form and the schema", () => {
    for (const c of seedCampaigns(Date.UTC(2026, 10, 2))) {
      const input = campaignInputSchema.parse(toInput(toFormValues(c, "UTC")));
      expect(input.start.slice(0, 16)).toBe(toFormValues(c, "UTC").startDate + "T" + toFormValues(c, "UTC").startTime);
      expect(input.end === null).toBe(c.endAt === null);
    }
  });
  it("starts a new campaign as an open-ended draft in the admin's zone, opening at the next 5 minutes", () => {
    const v = toFormValues(null, "Asia/Jakarta", Date.parse("2026-11-02T08:01:30Z"));
    expect(v).toMatchObject({ indefinitely: true, status: "draft", timeZone: "Asia/Jakarta", startDate: "2026-11-02", startTime: "15:05" });
    expect(toInput(v).end).toBeNull();
  });
  it("rounds Today up, never down", () => {
    expect(soon("UTC", Date.parse("2026-11-02T08:05:00Z"))).toEqual({ date: "2026-11-02", time: "08:05" });
    expect(soon("UTC", Date.parse("2026-11-02T23:58:00Z"))).toEqual({ date: "2026-11-03", time: "00:00" });
  });
  it("slugifies titles into valid slugs", () => {
    expect(slugify("  Save the Riverside Park! ")).toBe("save-the-riverside-park");
    expect(slugify("Café über Straße")).toBe("cafe-uber-stra-e");
    expect(slugify("a".repeat(59) + " b")).toBe("a".repeat(59));
  });
});
