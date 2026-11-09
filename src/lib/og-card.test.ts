import { describe, expect, it } from "vitest";
import { progressText } from "./og-card";

describe("progressText", () => {
  const milestones = [{ count: 500, label: "" }, { count: 750, label: "Council hears it" }];
  it("shows the count, goal and next milestone", () => {
    expect(progressText({ count: 520, goal: 1000, milestones })).toEqual({ headline: "520 of 1,000 signed", sub: "Next: Council hears it", fill: 52 });
  });
  it("falls back to the percentage without milestones and caps the bar past the goal", () => {
    expect(progressText({ count: 10, goal: 40 }).sub).toBe("25% of the goal");
    expect(progressText({ count: 1080, goal: 1000, milestones })).toEqual({ headline: "1,080 of 1,000 signed", sub: "Goal reached: 108%", fill: 100 });
  });
});
