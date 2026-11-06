import "server-only";
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { DEMO_MODE } from "@/lib/demo";
import { defaultStore, type Store } from "@/lib/server/kv";

export const CODE_TTL_SECONDS = 600;
export const MAX_ATTEMPTS = 5;

function secret(): string {
  const s = process.env.OTP_HMAC_SECRET;
  // Demo codes are printed on screen anyway; a live deploy must set its own secret.
  if (s) return s;
  if (DEMO_MODE) return "demo-mode-only";
  throw new Error("OTP_HMAC_SECRET is not set");
}

const keyFor = (email: string) => `otp:${createHash("sha256").update(email).digest("hex")}`;
const mac = (email: string, code: string) => createHmac("sha256", secret()).update(`${email}:${code}`).digest();

/** Issues a fresh single-use code; only its HMAC is stored. Email must already be normalised. */
export async function issueCode(email: string, store: Store = defaultStore): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const key = keyFor(email);
  await store.del(`${key}:n`);
  await store.set(key, mac(email, code).toString("hex"), CODE_TTL_SECONDS);
  return code;
}

export type CheckResult = "ok" | "invalid" | "expired";

export async function checkCode(email: string, code: string, store: Store = defaultStore): Promise<CheckResult> {
  const key = keyFor(email);
  const stored = await store.get(key);
  if (!stored) return "expired";
  if ((await store.incr(`${key}:n`, CODE_TTL_SECONDS)) > MAX_ATTEMPTS) {
    await store.del(key, `${key}:n`);
    return "expired";
  }
  if (!timingSafeEqual(Buffer.from(stored, "hex"), mac(email, code))) return "invalid";
  await store.del(key, `${key}:n`);
  return "ok";
}
