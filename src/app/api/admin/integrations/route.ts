import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { DEMO_DISABLED_MESSAGE, DEMO_MODE } from "@/lib/demo";
import { caller } from "@/lib/server/admin-auth";
import { INTEGRATIONS, integrationStatus, saveIntegration, type IntegrationKey } from "@/lib/server/integrations";

// Shown as set / not set only: changing these needs Vercel and a redeploy (ADR 0007).
const ENV_ONLY = [
  "FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN",
  "SIGNER_ID_SECRET", "OTP_HMAC_SECRET", "ADMIN_EMAILS", "MASTER_EMAIL", "CRON_SECRET", "SETTINGS_ENCRYPTION_KEY",
];
const FRESH_SECONDS = 600;
const NOT_FOUND = () => NextResponse.json({ error: "Not found" }, { status: 404 });

const bodySchema = z
  .object({ field: z.enum(Object.keys(INTEGRATIONS) as [IntegrationKey, ...IntegrationKey[]]), value: z.string().max(2000).nullable() })
  .strict();

/** Master only; everyone else gets a 404 so the route's existence stays hidden. Secret values never leave the server. */
export async function GET(req: Request) {
  if (!(await caller(req)).master) return NOT_FOUND();
  const status = await integrationStatus();
  const envOnly = ENV_ONLY.map((name) => ({ name, set: Boolean(process.env[name]) }));
  return NextResponse.json({ ...status, envOnly }, { headers: { "Cache-Control": "no-store" } });
}

/** Set (`value`) or clear (`null`) one override. Needs a sign-in from the last 10 minutes. */
export async function PUT(req: Request) {
  const who = await caller(req);
  if (!who.master || !who.uid) return NOT_FOUND();
  if (DEMO_MODE) return NextResponse.json({ error: DEMO_DISABLED_MESSAGE }, { status: 403 });
  if (!who.authTime || Date.now() / 1000 - who.authTime > FRESH_SECONDS)
    return NextResponse.json({ error: "Sign out and sign in again to change integrations." }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    await saveIntegration(parsed.data.field, parsed.data.value, who.uid);
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: "Invalid value" }, { status: 400 });
    if (e instanceof Error && e.message.includes("SETTINGS_ENCRYPTION_KEY"))
      return NextResponse.json({ error: "Set SETTINGS_ENCRYPTION_KEY in Vercel before saving secrets." }, { status: 409 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}
