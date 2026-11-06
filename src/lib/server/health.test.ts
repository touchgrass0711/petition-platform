import { describe, expect, it, vi } from "vitest";
import { countMetric, readHealth } from "./health";
import { memoryStore, type Store } from "./kv";
import { quotaKey } from "./email";

vi.mock("server-only", () => ({}));

const NOW = Date.parse("2026-11-04T10:00:00Z");
const DAY = 86_400_000;

describe("health counters", () => {
  it("sums the last 7 days against the 7 before, and reads today's email quota", async () => {
    const store = memoryStore();
    countMetric("ratelimit", store, NOW);
    countMetric("ratelimit", store, NOW - 6 * DAY);
    countMetric("ratelimit", store, NOW - 7 * DAY); // previous window
    countMetric("honeypot", store, NOW - 20 * DAY); // outside both
    await store.incr(quotaKey("brevo", new Date(NOW)), 60);
    await new Promise((r) => setTimeout(r)); // countMetric is fire and forget

    const h = await readHealth(store, NOW, { BREVO_API_KEY: "x" });
    expect(h.counters.find((c) => c.name === "ratelimit")).toMatchObject({ current: 2, previous: 1 });
    expect(h.counters.find((c) => c.name === "honeypot")).toMatchObject({ current: 0, previous: 0 });
    expect(h.providers.find((p) => p.name === "brevo")).toMatchObject({ used: 1, cap: 300, configured: true });
    expect(h.providers.find((p) => p.name === "resend")?.configured).toBe(false);
  });

  it("never throws into the request it counts", () => {
    const broken = { incr: () => Promise.reject(new Error("down")) } as unknown as Store;
    expect(() => countMetric("turnstile", broken, NOW)).not.toThrow();
  });
});
