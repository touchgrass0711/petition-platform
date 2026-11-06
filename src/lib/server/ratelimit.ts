import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { countMetric } from "@/lib/server/health";

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ? Redis.fromEnv() : null;

function limiter(tokens: number, window: Parameters<typeof Ratelimit.slidingWindow>[1], prefix: string) {
  const rl = redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(tokens, window), prefix }) : null;
  // shortcut: without Upstash credentials there is no limit; set them for any public deployment.
  return async (key: string): Promise<boolean> => {
    if (!rl) return true;
    const { success } = await rl.limit(key);
    if (!success) countMetric("ratelimit");
    return success;
  };
}

export const allowComment = limiter(3, "1 m", "rl:comments");
// Only edge-cache misses reach this, so the cap targets cursor-busting loops, not readers.
export const allowCommentRead = limiter(30, "1 m", "rl:comments-read");
// Email-code sign-in: caps inbox flooding per address and code guessing per IP.
export const allowCodeRequestByIp = limiter(5, "10 m", "rl:code-ip");
export const allowCodeRequestByEmail = limiter(3, "15 m", "rl:code-email");
// Daily cap too, so one inbox can't be flooded with ~288 codes a day.
export const allowCodeRequestByEmailDaily = limiter(5, "1 d", "rl:code-email-day");
export const allowVerify = limiter(10, "10 m", "rl:verify");
