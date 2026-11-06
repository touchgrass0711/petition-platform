import "server-only";
import { Redis } from "@upstash/redis";

export type Store = {
  set(key: string, value: string, ttl: number): Promise<void>;
  get(key: string): Promise<string | null>;
  incr(key: string, ttl: number): Promise<number>;
  del(...keys: string[]): Promise<void>;
};

export function redisStore(redis: Redis): Store {
  return {
    set: async (k, v, ttl) => void (await redis.set(k, v, { ex: ttl })),
    get: (k) => redis.get<string>(k),
    incr: async (k, ttl) => {
      const n = await redis.incr(k);
      if (n === 1) await redis.expire(k, ttl);
      return n;
    },
    del: async (...k) => void (await redis.del(...k)),
  };
}

// shortcut: per-instance memory, so codes don't survive across serverless instances; local dev and tests only.
export function memoryStore(): Store {
  const m = new Map<string, { v: string; exp: number }>();
  const live = (k: string) => {
    const e = m.get(k);
    if (e && e.exp > Date.now()) return e;
    m.delete(k);
    return null;
  };
  return {
    set: async (k, v, ttl) => void m.set(k, { v, exp: Date.now() + ttl * 1000 }),
    get: async (k) => live(k)?.v ?? null,
    incr: async (k, ttl) => {
      const n = Number(live(k)?.v ?? 0) + 1;
      m.set(k, { v: String(n), exp: live(k)?.exp ?? Date.now() + ttl * 1000 });
      return n;
    },
    del: async (...k) => k.forEach((key) => m.delete(key)),
  };
}

export const defaultStore =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ? redisStore(Redis.fromEnv()) : memoryStore();

