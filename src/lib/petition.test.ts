import { describe, expect, it } from "vitest";
import { getComments, getHighlights, getSingleCampaign, listCampaigns, PAGE_SIZE } from "./petition";

describe("getComments (seed fallback)", () => {
  it("pages through all comments without overlap", async () => {
    const first = await getComments();
    expect(first.comments).toHaveLength(PAGE_SIZE);
    expect(first.comments[0].pinned).toBe(true);
    expect(first.nextCursor).not.toBeNull();

    const second = await getComments(first.nextCursor);
    expect(second.comments.length).toBeGreaterThan(0);
    expect(second.nextCursor).toBeNull();
    const ids = new Set([...first.comments, ...second.comments].map((c) => c.id));
    expect(ids.size).toBe(first.comments.length + second.comments.length);
  });
});

describe("campaign lists (seed fallback)", () => {
  it("lists visible campaigns newest start first, without descriptions", async () => {
    const { campaigns, nextCursor } = await listCampaigns();
    expect(campaigns.map((c) => c.slug)).toEqual([
      "scheduled-campaign", "default", "achieved-campaign", "ended-achieved-campaign", "closed-campaign",
    ]);
    expect(campaigns.every((c) => !("description" in c))).toBe(true);
    expect(nextCursor).toBeNull();
    expect((await listCampaigns("achieved-campaign")).campaigns.map((c) => c.slug)).toEqual(["ended-achieved-campaign", "closed-campaign"]);
  });
  it("picks the featured and the newest live campaign", async () => {
    const { featured, newestLive } = await getHighlights();
    expect(featured?.slug).toBe("default");
    expect(newestLive?.slug).toBe("default");
  });
});

describe("getSingleCampaign (seed fallback)", () => {
  it("picks the featured campaign", async () => {
    expect((await getSingleCampaign())?.slug).toBe((await getHighlights()).featured?.slug);
  });
});
