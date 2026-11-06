import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { z } from "zod";
import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { seal, sealedSchema, settingsKey, unseal } from "./secret-box";

const text = z.string().trim().min(1).max(2000);
const email = z.string().trim().email().max(254);

/** Service values the Master account may override (ADR 0007). Keys are the env var names they override. Everything else stays env-only. */
export const INTEGRATIONS = {
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: { secret: false, schema: text },
  TURNSTILE_SECRET_KEY: { secret: true, schema: text },
  NEXT_PUBLIC_POSTHOG_KEY: { secret: false, schema: text },
  POSTHOG_PROJECT_ID: { secret: false, schema: z.string().trim().regex(/^\d{1,12}$/) },
  POSTHOG_PERSONAL_API_KEY: { secret: true, schema: text },
  NEXT_PUBLIC_GOOGLE_SIGNIN: { secret: false, schema: z.enum(["true", "false"]) },
  EMAIL_FROM: { secret: false, schema: email },
  EMAIL_FROM_NAME: { secret: false, schema: z.string().trim().min(1).max(100) },
  BREVO_API_KEY: { secret: true, schema: text },
  RESEND_API_KEY: { secret: true, schema: text },
  MAILJET_API_KEY: { secret: true, schema: text },
  MAILJET_SECRET_KEY: { secret: true, schema: text },
  GMAIL_USER: { secret: false, schema: email },
  GMAIL_APP_PASSWORD: { secret: true, schema: text },
} as const;
export type IntegrationKey = keyof typeof INTEGRATIONS;
export type IntegrationEnv = Partial<Record<IntegrationKey, string>>;
const KEYS = Object.keys(INTEGRATIONS) as IntegrationKey[];

// config/ has no Firestore rule, so only the server can read or write it.
const ref = () => adminDb().collection("config").doc("integrations");

// Caches the stored doc (ciphertext only); decryption happens per call so plain secrets never enter the data cache.
const readDoc = unstable_cache(
  async (): Promise<Record<string, unknown>> => (await ref().get()).data() ?? {},
  ["integrations"],
  { tags: ["integrations"] },
);

/** Panel value → env → unset. A panel secret that can't be decrypted (key missing, wrong or tampered) falls back to env. */
export function mergeIntegrations(doc: Record<string, unknown>, env: Record<string, string | undefined>): IntegrationEnv {
  const key = settingsKey(env);
  const out: IntegrationEnv = {};
  for (const k of KEYS) {
    const raw = doc[k];
    let panel: string | null = null;
    if (INTEGRATIONS[k].secret) {
      const box = sealedSchema.safeParse(raw);
      panel = box.success && key ? unseal(box.data, key) : null;
    } else if (typeof raw === "string") panel = raw;
    const value = panel ?? env[k];
    if (value) out[k] = value;
  }
  return out;
}

// Without Firebase there is nothing to read, so skip the cache entirely (it also only works inside Next).
export const getIntegrationEnv = async (): Promise<IntegrationEnv> =>
  mergeIntegrations(isFirebaseAdminConfigured ? await readDoc() : {}, process.env);

/** process.env with the panel overrides applied: what server code reads service keys from. */
export const serverEnv = async (): Promise<Record<string, string | undefined>> => ({ ...process.env, ...(await getIntegrationEnv()) });

/**
 * Sets (value) or clears (null) one override and appends an audit entry without the value, in one batch.
 * Throws on an invalid value, or on a secret when SETTINGS_ENCRYPTION_KEY is missing (fail closed: never stored in plain text).
 */
export async function saveIntegration(field: IntegrationKey, value: string | null, by: string): Promise<void> {
  const { secret, schema } = INTEGRATIONS[field];
  let stored: unknown = FieldValue.delete();
  if (value !== null) {
    const parsed = schema.parse(value);
    if (secret) {
      const key = settingsKey();
      if (!key) throw new Error("SETTINGS_ENCRYPTION_KEY is not set");
      stored = seal(parsed, key);
    } else stored = parsed;
  }
  const doc = ref();
  const batch = adminDb().batch();
  batch.set(doc, { [field]: stored }, { merge: true });
  batch.create(doc.collection("audit").doc(), { at: FieldValue.serverTimestamp(), by, field, action: value === null ? "clear" : "set" });
  await batch.commit();
  revalidateTag("integrations");
  // Public values are baked into pages cached for 24 h (ADR 0001).
  if (!secret) revalidatePath("/", "layout");
}

export type IntegrationSource = "panel" | "env" | "unset";

/** Where each value comes from (never the secret itself), whether secrets can be saved, and the last 20 changes. */
export async function integrationStatus() {
  const panel = mergeIntegrations(isFirebaseAdminConfigured ? await readDoc() : {}, { SETTINGS_ENCRYPTION_KEY: process.env.SETTINGS_ENCRYPTION_KEY });
  const fields = KEYS.map((key) => {
    const source: IntegrationSource = panel[key] ? "panel" : process.env[key] ? "env" : "unset";
    const value = INTEGRATIONS[key].secret ? undefined : (panel[key] ?? process.env[key]);
    return { key, secret: INTEGRATIONS[key].secret, source, value };
  });
  const audit = isFirebaseAdminConfigured
    ? (await ref().collection("audit").orderBy("at", "desc").limit(20).get()).docs.map((d) => {
        const { at, field, action } = d.data();
        return { at: at?.toDate?.().toISOString() ?? null, field: String(field), action: String(action) };
      })
    : [];
  return { fields, encryption: settingsKey() !== null, audit };
}
