import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));
vi.mock("@/lib/firebase/admin", () => ({ isFirebaseAdminConfigured: false, adminDb: () => ({}) }));

const { seal, settingsKey, unseal } = await import("./secret-box");
const { mergeIntegrations, saveIntegration } = await import("./integrations");

const b64 = randomBytes(32).toString("base64");
const key = settingsKey({ SETTINGS_ENCRYPTION_KEY: b64 })!;

describe("secret-box", () => {
  it("round-trips", () => {
    expect(unseal(seal("s3cret ✓", key), key)).toBe("s3cret ✓");
  });
  it("refuses a wrong key and a tampered tag or ciphertext", () => {
    const box = seal("s3cret", key);
    expect(unseal(box, randomBytes(32))).toBeNull();
    const flip = (s: string) => Buffer.from(Buffer.from(s, "base64").map((b, i) => (i === 0 ? b ^ 1 : b))).toString("base64");
    expect(unseal({ ...box, tag: flip(box.tag) }, key)).toBeNull();
    expect(unseal({ ...box, ct: flip(box.ct) }, key)).toBeNull();
  });
  it("has no key when it is missing or not 32 bytes", () => {
    expect(settingsKey({})).toBeNull();
    expect(settingsKey({ SETTINGS_ENCRYPTION_KEY: randomBytes(16).toString("base64") })).toBeNull();
  });
});

describe("mergeIntegrations", () => {
  const env = { SETTINGS_ENCRYPTION_KEY: b64, TURNSTILE_SECRET_KEY: "env-secret", EMAIL_FROM: "env@x.io", POSTHOG_PROJECT_ID: "1" };

  it("prefers the panel, then env, and leaves unset keys out", () => {
    const merged = mergeIntegrations({ TURNSTILE_SECRET_KEY: seal("panel-secret", key), EMAIL_FROM: "panel@x.io" }, env);
    expect(merged).toEqual({ TURNSTILE_SECRET_KEY: "panel-secret", EMAIL_FROM: "panel@x.io", POSTHOG_PROJECT_ID: "1" });
  });
  it("falls back to env when a panel secret can't be read", () => {
    const doc = { TURNSTILE_SECRET_KEY: seal("panel-secret", key) };
    expect(mergeIntegrations(doc, { ...env, SETTINGS_ENCRYPTION_KEY: undefined }).TURNSTILE_SECRET_KEY).toBe("env-secret");
    expect(mergeIntegrations({ TURNSTILE_SECRET_KEY: "plain text" }, env).TURNSTILE_SECRET_KEY).toBe("env-secret");
  });
  it("ignores unknown keys and non-string public values", () => {
    expect(mergeIntegrations({ FIREBASE_PRIVATE_KEY: "x", EMAIL_FROM: 5 }, env).EMAIL_FROM).toBe("env@x.io");
  });
});

describe("saveIntegration", () => {
  it("refuses invalid values and secrets without a key before touching Firestore", async () => {
    vi.stubEnv("SETTINGS_ENCRYPTION_KEY", "");
    await expect(saveIntegration("EMAIL_FROM", "not-an-email", "uid")).rejects.toThrow();
    await expect(saveIntegration("BREVO_API_KEY", "k", "uid")).rejects.toThrow("SETTINGS_ENCRYPTION_KEY");
  });
});
