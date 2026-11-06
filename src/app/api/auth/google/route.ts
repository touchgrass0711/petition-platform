import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { DEMO_MODE } from "@/lib/demo";
import { publicConfig } from "@/lib/public-config";
import { serverEnv } from "@/lib/server/integrations";
import { allowVerify } from "@/lib/server/ratelimit";
import { customTokenFor, deleteAuthUser, verifyGoogleToken } from "@/lib/server/signer-auth";

const bodySchema = z.object({ idToken: z.string().min(1).max(4096) });

/** Live mode: Google ID token in, the same signer custom token the email code gives out (ADR 0006). */
export async function POST(req: NextRequest) {
  // Demo Mode simulates Google in the browser and never calls this.
  if (DEMO_MODE || !publicConfig(await serverEnv()).googleSignin) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (!(await allowVerify(ip))) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const google = await verifyGoogleToken(parsed.data.idToken);
  if (!google) return NextResponse.json({ error: "Google sign-in failed. Try again or use your email." }, { status: 401 });
  const token = await customTokenFor(google.email, google.photo);
  // Best effort: a leftover Google user is harmless, so a cleanup failure must not block signing.
  await deleteAuthUser(google.uid).catch((e) => console.error("google user cleanup failed", e));
  return NextResponse.json({ ok: true, email: google.email, photo: google.photo, token });
}
