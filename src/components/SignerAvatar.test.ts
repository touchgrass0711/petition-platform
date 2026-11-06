import { describe, expect, it } from "vitest";
import { hue, initials } from "./SignerAvatar";

describe("initials", () => {
  it("takes the first and last word", () => expect(initials("ada  king lovelace")).toBe("AL"));
  it("uses one letter for one word", () => expect(initials("Signer")).toBe("S"));
  it("skips punctuation and emoji-only words", () => expect(initials("(jo) 🙂 bloggs!")).toBe("JB"));
  it("falls back to ? without letters", () => expect(initials(" -- ")).toBe("?"));
  it("keeps non-Latin letters", () => expect(initials("Ñandú Ölz")).toBe("ÑÖ"));
});

describe("hue", () => {
  it("is stable and in range", () => {
    expect(hue("Signer")).toBe(hue("Signer"));
    expect(hue("Signer")).toBeGreaterThanOrEqual(0);
    expect(hue("Signer")).toBeLessThan(360);
    expect(hue("Ada")).not.toBe(hue("Bob"));
  });
});
