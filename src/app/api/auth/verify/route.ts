import { NextResponse, type NextRequest } from "next/server";
import { DEMO_MODE } from "@/lib/demo";
import { verifyRequestSchema } from "@/lib/schemas";
import { checkCode } from "@/lib/server/otp";
import { allowVerify } from "@/lib/server/ratelimit";
import { customTokenFor } from "@/lib/server/signer-auth";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (!(await allowVerify(ip))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  const parsed = verifyRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const result = await checkCode(parsed.data.email, parsed.data.code);
  if (result === "expired") return NextResponse.json({ error: "Code expired. Request a new one." }, { status: 410 });
  if (result === "invalid") return NextResponse.json({ error: "Wrong code. Check it and try again." }, { status: 401 });

  // Demo Mode: no Firebase user is created; the browser keeps a session-only flag.
  if (DEMO_MODE) return NextResponse.json({ ok: true, demo: true, email: parsed.data.email });
  // Live mode: the browser signs in with this token; write APIs then require its ID token (ADR 0003).
  return NextResponse.json({ ok: true, demo: false, email: parsed.data.email, token: await customTokenFor(parsed.data.email) });
}
