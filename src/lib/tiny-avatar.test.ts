import { describe, expect, it } from "vitest";
import { isGooglePhoto, isTinyAvatar, TINY_AVATAR_MAX_BYTES } from "./tiny-avatar";

const url = (type: string, bytes: number[] | Uint8Array) => `data:image/${type};base64,${Buffer.from(bytes).toString("base64")}`;
const webp = (size: number) => {
  const b = new Uint8Array(size);
  b.set(Buffer.from("RIFF"), 0);
  b.set(Buffer.from("WEBP"), 8);
  return b;
};

describe("isTinyAvatar", () => {
  it("accepts small real WebP, PNG and JPEG bytes", () => {
    expect(isTinyAvatar(url("webp", webp(2000)))).toBe(true);
    expect(isTinyAvatar(url("png", [0x89, 0x50, 0x4e, 0x47, ...new Array(20).fill(0)]))).toBe(true);
    expect(isTinyAvatar(url("jpeg", [0xff, 0xd8, 0xff, ...new Array(20).fill(0)]))).toBe(true);
  });

  it("rejects oversize, mislabelled, non-image and non-data values", () => {
    expect(isTinyAvatar(url("webp", webp(TINY_AVATAR_MAX_BYTES + 1)))).toBe(false);
    expect(isTinyAvatar(url("png", webp(100)))).toBe(false); // WebP bytes labelled PNG
    expect(isTinyAvatar(url("svg+xml", Buffer.from("<svg onload=alert(1)>")))).toBe(false);
    expect(isTinyAvatar("https://example.com/a.webp")).toBe(false);
    expect(isTinyAvatar("data:image/webp;base64,@@@")).toBe(false);
    expect(isTinyAvatar(url("webp", [1, 2, 3]))).toBe(false);
  });
});

describe("isGooglePhoto", () => {
  it("accepts only Google profile photo URLs", () => {
    expect(isGooglePhoto("https://lh3.googleusercontent.com/a/ACg8ocK=s96-c")).toBe(true);
    expect(isGooglePhoto("http://lh3.googleusercontent.com/a/x")).toBe(false);
    expect(isGooglePhoto("https://lh3.googleusercontent.com.evil.example/a")).toBe(false);
    expect(isGooglePhoto("https://evil.example/lh3.googleusercontent.com/a")).toBe(false);
    expect(isGooglePhoto(`https://lh3.googleusercontent.com/${"a".repeat(600)}`)).toBe(false);
  });
});
