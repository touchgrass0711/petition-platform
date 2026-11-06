import { NextResponse } from "next/server";
import { DEMO_MODE } from "@/lib/demo";
import { guard } from "@/lib/server/admin-auth";
import { readHealth, SAMPLE_HEALTH } from "@/lib/server/health";
import { serverEnv } from "@/lib/server/integrations";

/** Abuse counters and today's email quota per provider. Sample numbers in Demo Mode or without Upstash. */
export async function GET(req: Request) {
  const denied = await guard(req, "health");
  if (denied) return denied;
  const live = !DEMO_MODE && Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  const health = live ? await readHealth(undefined, undefined, await serverEnv()) : SAMPLE_HEALTH;
  return NextResponse.json({ ...health, sample: !live }, { headers: { "Cache-Control": "private, max-age=60" } });
}
