import { describe, expect, it } from "vitest";
import { commentRequestSchema, NAME_MAX } from "./schemas";

const valid = { name: "Signer", message: "I support this.", anonymous: false, turnstileToken: "tok" };

describe("commentRequestSchema", () => {
  it("accepts a valid comment and defaults avatarUrl", () => {
    expect(commentRequestSchema.parse(valid)).toEqual({ ...valid, avatarUrl: null, avatarPreset: null });
  });
  it("trims and rejects a blank comment", () => {
    expect(commentRequestSchema.safeParse({ ...valid, message: "   " }).success).toBe(false);
  });
  it("rejects an overlong name", () => {
    expect(commentRequestSchema.safeParse({ ...valid, name: "x".repeat(NAME_MAX + 1) }).success).toBe(false);
  });
  it("requires a Turnstile token", () => {
    expect(commentRequestSchema.safeParse({ ...valid, turnstileToken: "" }).success).toBe(false);
  });
  it("rejects anything but a tiny inline avatar", () => {
    expect(commentRequestSchema.safeParse({ ...valid, avatarUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(commentRequestSchema.safeParse({ ...valid, avatarUrl: "https://evil.example/a.png" }).success).toBe(false);
  });
  it("signs as Anonymous by default and drops the typed name", () => {
    const rest = { ...valid, anonymous: undefined };
    expect(commentRequestSchema.parse({ ...rest, name: "Real Name" })).toMatchObject({ name: "Anonymous", anonymous: true });
    expect(commentRequestSchema.safeParse({ ...rest, name: "" }).success).toBe(true);
  });
  it("requires a name when not anonymous", () => {
    expect(commentRequestSchema.safeParse({ ...valid, name: " " }).success).toBe(false);
  });
  it.each([
    ["two links", "see https://a.example and www.b.example"],
    ["repeated characters", "yes!!!!!!!!!!"],
    ["all caps", "SIGN THIS PETITION RIGHT NOW PLEASE"],
  ])("rejects spammy comments: %s", (_label, message) => {
    expect(commentRequestSchema.safeParse({ ...valid, message }).success).toBe(false);
  });
});
