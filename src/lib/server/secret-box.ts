import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

/** One AES-256-GCM sealed value as stored in Firestore. */
export const sealedSchema = z.object({ v: z.literal(1), iv: z.string(), tag: z.string(), ct: z.string() }).strict();
export type Sealed = z.infer<typeof sealedSchema>;

/** SETTINGS_ENCRYPTION_KEY = 32 random bytes, base64 (`openssl rand -base64 32`). Null when missing or malformed. */
export function settingsKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const key = Buffer.from(env.SETTINGS_ENCRYPTION_KEY ?? "", "base64");
  return key.length === 32 ? key : null;
}

export function seal(plain: string, key: Buffer): Sealed {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return { v: 1, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), ct: ct.toString("base64") };
}

/** The plain text, or null for a wrong key, a tampered value or a malformed record. */
export function unseal(box: Sealed, key: Buffer): string | null {
  try {
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(box.iv, "base64"));
    d.setAuthTag(Buffer.from(box.tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(box.ct, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
