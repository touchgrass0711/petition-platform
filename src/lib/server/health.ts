import "server-only";
import { defaultStore, type Store } from "@/lib/server/kv";
import { PROVIDERS, quotaKey } from "@/lib/server/email";

// Abuse counters per UTC day in Upstash (`metric:{day}:{name}`), shown on the admin dashboard as last 7 days vs the 7 before.

export const HEALTH = {
  ratelimit: "Rate-limit blocks",
  turnstile: "Turnstile failures",
  honeypot: "Honeypot hits",
} as const;
export type HealthName = keyof typeof HEALTH;

const DAY_MS = 86_400_000;
const TTL = 20 * 86_400; // covers both 7-day windows
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Fire and forget: a counter must never fail or slow the request it counts. */
export function countMetric(name: HealthName, store: Store = defaultStore, now = Date.now()) {
  store.incr(`metric:${day(now)}:${name}`, TTL).catch(() => {});
}

export type Health = {
  counters: { name: HealthName; label: string; current: number; previous: number }[];
  providers: { name: string; used: number; cap: number; configured: boolean }[];
};

// shortcut: 14 GETs per counter per load (42 total, admin-only); switch to MGET if the dashboard gets polled.
export async function readHealth(store: Store = defaultStore, now = Date.now(), env: Record<string, string | undefined> = process.env): Promise<Health> {
  const sum = async (name: string, from: number) => {
    const vals = await Promise.all(Array.from({ length: 7 }, (_, i) => store.get(`metric:${day(now - (from + i) * DAY_MS)}:${name}`)));
    return vals.reduce((s, v) => s + Number(v ?? 0), 0);
  };
  const counters = await Promise.all(
    (Object.keys(HEALTH) as HealthName[]).map(async (name) => ({ name, label: HEALTH[name], current: await sum(name, 0), previous: await sum(name, 7) })),
  );
  const providers = await Promise.all(
    PROVIDERS.map(async (p) => ({ name: p.name, cap: p.dailyCap, configured: p.configured(env), used: Number((await store.get(quotaKey(p.name, new Date(now)))) ?? 0) })),
  );
  return { counters, providers };
}

export const SAMPLE_HEALTH: Health = {
  counters: [
    { name: "ratelimit", label: HEALTH.ratelimit, current: 41, previous: 58 },
    { name: "turnstile", label: HEALTH.turnstile, current: 17, previous: 12 },
    { name: "honeypot", label: HEALTH.honeypot, current: 9, previous: 9 },
  ],
  providers: PROVIDERS.map((p, i) => ({ name: p.name, cap: p.dailyCap, configured: i < 2, used: [212, 18, 0][i] ?? 0 })),
};
