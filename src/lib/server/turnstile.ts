import "server-only";
import { DEMO_MODE } from "@/lib/demo";
import { countMetric } from "@/lib/server/health";
import { serverEnv } from "@/lib/server/integrations";

// Cloudflare's published test secrets (always pass / always fail / token spent).
export const isTestSecret = (secret: string) => /^[123]x0{20,}/.test(secret);

export async function verifyTurnstile(token: string, ip: string, demo = DEMO_MODE): Promise<boolean> {
  const secret = (await serverEnv()).TURNSTILE_SECRET_KEY;
  // Demo Mode writes nothing, so an unconfigured or test-key demo deploy is fine; live mode needs a real key.
  if (!secret) return demo;
  if (!demo && isTestSecret(secret)) {
    console.error("turnstile: test secret key in live mode; set a real TURNSTILE_SECRET_KEY");
    return false;
  }
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { success: boolean };
  if (!data.success) countMetric("turnstile");
  return data.success;
}
