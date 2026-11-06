import { describe, expect, it } from "vitest";
import { percent } from "./format";

describe("percent", () => {
  it("rounds and caps at 100", () => {
    expect(percent(8452, 10000)).toBe(85);
    expect(percent(12000, 10000)).toBe(100);
  });
  it("handles a zero goal", () => {
    expect(percent(5, 0)).toBe(0);
  });
});
