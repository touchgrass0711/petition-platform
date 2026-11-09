import { describe, expect, it } from "vitest";
import { taggedUrl } from "./ShareButtons";

describe("taggedUrl", () => {
  it("tags campaign links with channel, medium and slug", () => {
    const u = new URL(taggedUrl("https://example.com/c/save-park", "whatsapp"));
    expect(Object.fromEntries(u.searchParams)).toEqual({ utm_source: "whatsapp", utm_medium: "share", utm_campaign: "save-park" });
  });
  it("leaves out the campaign tag off campaign pages and keeps existing params", () => {
    const u = new URL(taggedUrl("https://example.com/?a=1", "x"));
    expect(Object.fromEntries(u.searchParams)).toEqual({ a: "1", utm_source: "x", utm_medium: "share" });
  });
});
