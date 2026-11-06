import { describe, expect, it } from "vitest";
import { applyModeration, MAX_PINNED, moderationSchema } from "./comment-moderation";

const shown = { pinned: false, hidden: false };

describe("applyModeration", () => {
  it("pins below the cap", () => expect(applyModeration(shown, { pinned: true }, MAX_PINNED - 1)).toEqual({ pinned: true, hidden: false }));
  it("refuses a pin at the cap", () => expect(applyModeration(shown, { pinned: true }, MAX_PINNED)).toMatch(/At most 3/));
  it("always allows unpinning", () => expect(applyModeration({ pinned: true, hidden: false }, { pinned: false }, 9)).toEqual(shown));
  it("refuses to pin a hidden comment", () => expect(applyModeration({ pinned: false, hidden: true }, { pinned: true }, 0)).toMatch(/Unhide/));
  it("unpins when hiding", () => expect(applyModeration({ pinned: true, hidden: false }, { hidden: true }, 0)).toEqual({ pinned: false, hidden: true }));
  it("unhides without pinning", () => expect(applyModeration({ pinned: false, hidden: true }, { hidden: false }, 0)).toEqual(shown));
});

describe("moderationSchema", () => {
  it("takes one flag at a time", () => {
    expect(moderationSchema.safeParse({ pinned: true }).success).toBe(true);
    expect(moderationSchema.safeParse({ pinned: true, hidden: true }).success).toBe(false);
    expect(moderationSchema.safeParse({ name: "x" }).success).toBe(false);
  });
});
