import { describe, expect, it } from "vitest";
import { nextStepLine, shareText } from "./ShareCard";

describe("shareText", () => {
  it("uses the signer's reason, trimmed and capped", () => {
    expect(shareText("Save the Park", "")).toBe("I signed: Save the Park");
    expect(shareText("Save the Park", "  kids  play here ")).toBe('I signed "Save the Park" because kids play here');
    expect(shareText("T", "x".repeat(300)).length).toBeLessThan(170);
  });
});

describe("nextStepLine", () => {
  const ms = [{ count: 500, label: "" }, { count: 750, label: "" }];
  it("points at the next milestone, then the goal, then nothing", () => {
    expect(nextStepLine(500, 1000, ms)).toBe("Share it to help reach 750 signatures.");
    expect(nextStepLine(800, 1000, ms)).toBe("Share it to help reach 1,000 signatures.");
    expect(nextStepLine(1200, 1000, ms)).toBeUndefined();
  });
});
