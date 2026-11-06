import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_MODE } from "@/lib/demo";
import { codeRequestSchema } from "@/lib/schemas";
import { codeEmail, EmailRejectedError, sendEmail } from "@/lib/server/email";
import { issueCode } from "@/lib/server/otp";
import { allowCodeRequestByEmail, allowCodeRequestByEmailDaily, allowCodeRequestByIp } from "@/lib/server/ratelimit";
import { verifyTurnstile } from "@/lib/server/turnstile";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const parsed = codeRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { email, turnstileToken } = parsed.data;
  const emailKey = createHash("sha256").update(email).digest("hex");
  if (
    !(await allowCodeRequestByIp(ip)) ||
    !(await allowCodeRequestByEmail(emailKey)) ||
    !(await allowCodeRequestByEmailDaily(emailKey))
  ) {
    return NextResponse.json({ error: "Too many codes requested. Try again later." }, { status: 429 });
  }
  if (!(await verifyTurnstile(turnstileToken, ip))) {
    return NextResponse.json({ error: "Verification failed" }, { status: 403 });
  }

  const code = await issueCode(email);
  // Demo Mode: no email is sent; the code goes back to the screen, labelled as a demo.
  if (DEMO_MODE) return NextResponse.json({ sent: true, demo: true, demoCode: code });

  // Live mode: the code is only ever emailed, never returned. Providers fall back in order (ADR 0003).
  try {
    await sendEmail(codeEmail(email, code));
  } catch (e) {
    if (e instanceof EmailRejectedError) return NextResponse.json({ error: "We couldn't send email to that address." }, { status: 400 });
    console.error("email: all providers failed", e);
    return NextResponse.json({ error: "We can't send codes right now. Try again later." }, { status: 503 });
  }
  return NextResponse.json({ sent: true, demo: false });
}
