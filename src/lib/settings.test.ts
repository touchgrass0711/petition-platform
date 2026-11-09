import { describe, expect, it } from "vitest";
import { blocked, DEFAULT_SETTINGS, settingsSchema } from "./settings";

describe("blocked", () => {
  it("defaults to single-campaign mode with every switch on", () => {
    expect(DEFAULT_SETTINGS).toEqual({ mode: "single", disabled: [] });
    expect(blocked(DEFAULT_SETTINGS, "edit", false)).toBeNull();
    expect(blocked(DEFAULT_SETTINGS, "create", true)).toMatch(/single-campaign/);
  });
  it("applies switches to admins but not developers", () => {
    const s = { mode: "multiple" as const, disabled: ["edit" as const] };
    expect(blocked(s, "edit", false)).toBe("Not available for this account.");
    expect(blocked(s, "edit", true)).toBeNull();
    expect(blocked(s, "goal", false)).toBeNull();
  });
  it("single mode blocks create, feature and delete for everyone but keeps edit", () => {
    const s = { mode: "single" as const, disabled: [] };
    for (const cap of ["create", "feature", "delete"] as const) expect(blocked(s, cap, true)).toMatch(/single-campaign/);
    expect(blocked(s, "edit", false)).toBeNull();
  });
  it("single mode allows creating the first campaign only", () => {
    const s = { mode: "single" as const, disabled: [] };
    expect(blocked(s, "create", false, 0)).toBeNull();
    expect(blocked(s, "create", false, 1)).toMatch(/single-campaign/);
    expect(blocked(s, "feature", true, 0)).toMatch(/single-campaign/);
    expect(blocked({ mode: "single", disabled: ["create"] }, "create", false, 0)).toBe("Not available for this account.");
  });
});

describe("settingsSchema", () => {
  it("rejects unknown capabilities, modes and extra keys", () => {
    expect(settingsSchema.safeParse({ mode: "single", disabled: ["nuke"] }).success).toBe(false);
    expect(settingsSchema.safeParse({ mode: "many", disabled: [] }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...DEFAULT_SETTINGS, x: 1 }).success).toBe(false);
  });
});
