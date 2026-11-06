// Avatars live inline on the comment as a tiny data URL (about 64 px WebP), so they need no Storage bucket,
// no Blaze plan and no extra Firestore read per avatar. Checked on both client and server.

export const TINY_AVATAR_PX = 64;
/** Photo uploads (inline, no Storage). Off hides "Upload image"; Google photo, initials and colours stay. */
export const AVATAR_UPLOADS = process.env.NEXT_PUBLIC_AVATAR_UPLOADS !== "false";
/** Colour choices for the initials avatar (OKLCH hues). */
export const AVATAR_PRESET_HUES = [250, 150, 25, 300, 75, 200];

/** A Google profile photo URL (live mode). The server also checks it is the signer's own, from their token. */
export const isGooglePhoto = (value: string) => value.length <= 500 && /^https:\/\/lh\d\.googleusercontent\.com\/[^\s"'<>]+$/.test(value);
/** Hard cap on decoded bytes; a 64 px WebP is usually 1-3 KB. */
export const TINY_AVATAR_MAX_BYTES = 8 * 1024;

const PREFIX = /^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/;
const MAGIC: Record<string, (b: Uint8Array) => boolean> = {
  webp: (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP",
  png: (b) => b[0] === 0x89 && ascii(b, 1, 4) === "PNG",
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
};
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

/** True when the value is a base64 WebP/PNG/JPEG data URL whose bytes really are that format and within the cap. */
export function isTinyAvatar(value: string): boolean {
  const m = PREFIX.exec(value);
  // Base64 length bounds the decoded size before we decode anything.
  if (!m || m[2].length > Math.ceil(TINY_AVATAR_MAX_BYTES / 3) * 4) return false;
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  return bytes.length >= 12 && bytes.length <= TINY_AVATAR_MAX_BYTES && MAGIC[m[1]](bytes);
}
