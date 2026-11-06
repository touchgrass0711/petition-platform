import { describe, expect, it } from "vitest";
import { holdProgress, ringFill } from "./hold";

describe("hold to sign", () => {
  it("fills over the hold duration and clamps", () => {
    expect(holdProgress(0, 1000, false)).toBe(0);
    expect(holdProgress(500, 1000, false)).toBe(0.5);
    expect(holdProgress(5000, 1000, false)).toBe(1);
    expect(holdProgress(-5, 1000, false)).toBe(0);
  });

  it("steps in quarters with reduced motion but still completes", () => {
    expect(holdProgress(600, 1000, true)).toBe(0.5);
    expect(holdProgress(999, 1000, true)).toBe(0.75);
    expect(holdProgress(1000, 1000, true)).toBe(1);
  });

  it("draws rings inner to outer", () => {
    expect(ringFill(0.5, 0, 8)).toBe(1);
    expect(ringFill(0.5, 3, 8)).toBe(1);
    expect(ringFill(0.5, 4, 8)).toBe(0);
    expect(ringFill(0.5625, 4, 8)).toBe(0.5);
  });
});
