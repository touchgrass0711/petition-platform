import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");

// Firestore fake: docs by path; set() honours mergeFields by replacing only the listed top-level fields.
const store = new Map<string, Record<string, unknown>>();
const write = (path: string, data: Record<string, unknown>, opts?: { merge?: boolean; mergeFields?: string[] }) => {
  const prev = store.get(path) ?? {};
  if (opts?.mergeFields) store.set(path, { ...prev, ...Object.fromEntries(opts.mergeFields.map((f) => [f, data[f]])) });
  else store.set(path, opts?.merge ? { ...prev, ...data } : data);
};
const doc = (path: string) => ({
  path,
  get: async () => ({ get: (k: string) => store.get(path)?.[k] }),
  set: async (d: Record<string, unknown>, o?: { merge?: boolean }) => write(path, d, o),
});
vi.mock("@/lib/firebase/admin", () => ({
  isFirebaseAdminConfigured: true,
  adminDb: () => ({
    doc,
    collection: () => ({ select: () => ({ get: async () => ({ docs: [{ id: "save-park" }] }) }) }),
    batch: () => {
      const ops: [string, Record<string, unknown>, { mergeFields: string[] }][] = [];
      return {
        set: (r: { path: string }, d: Record<string, unknown>, o: { mergeFields: string[] }) => ops.push([r.path, d, o]),
        commit: async () => ops.forEach(([p, d, o]) => write(p, d, o)),
      };
    },
  }),
}));

// PostHog fake: the core query returns one day for the campaign and one for a junk path.
const queries: string[] = [];
vi.mock("@/lib/server/posthog", () => ({
  isPosthogQueryConfigured: () => true,
  hogql: async (q: string) => {
    queries.push(q);
    if (q.includes("FROM sessions")) return [["2026-11-01", "save-park", 3, 600]];
    if (q.includes("countIf(event = '$pageview')")) return [["2026-11-01", "save-park", 40, 30, 32, 5, 3, 2], ["2026-11-01", "junk", 9, 9, 9, 0, 0, 0]];
    return [];
  },
}));

const { GET } = await import("./route");
const call = (auth?: string) => GET(new Request("http://x/api/cron/rollup", { headers: auth ? { authorization: auth } : {} }));

describe("rollup cron", () => {
  beforeEach(() => {
    store.clear();
    queries.length = 0;
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.useFakeTimers({ now: Date.parse("2026-11-02T00:30:00Z"), toFake: ["Date"] });
  });

  it("refuses without the secret, and fails closed when none is configured", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong!")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(503);
    expect(queries).toHaveLength(0);
  });

  it("resumes from progress, keeps signatures and writes the same doc on a rerun", async () => {
    store.set("meta/rollup", { lastDay: "2026-10-31" });
    store.set("petitions/save-park/daily/2026-11-01", { sig: 7, sigH: { "09": 7 }, views: 1 });
    const res = await (await call("Bearer s3cret")).json();
    expect(res).toMatchObject({ lastDay: "2026-11-01", chunks: 1, written: 1, caughtUp: true });
    expect(queries).toHaveLength(7);
    const day = store.get("petitions/save-park/daily/2026-11-01")!;
    expect(day).toMatchObject({ sig: 7, sigH: { "09": 7 }, views: 40, visitors: 30, bounces: 3, funnel: { started: 5, codeSent: 3, verified: 2 } });
    expect([...store.keys()].some((k) => k.includes("junk"))).toBe(false);

    // Caught up: a second run makes no queries and no writes.
    const again = await (await call("Bearer s3cret")).json();
    expect(again).toMatchObject({ chunks: 0, written: 0, caughtUp: true });
    expect(queries).toHaveLength(7);

    // A forced rerun of the same day writes identical values.
    store.set("meta/rollup", { lastDay: "2026-10-31" });
    await call("Bearer s3cret");
    expect(store.get("petitions/save-park/daily/2026-11-01")).toEqual(day);
  });

  it("caps a first-run backfill per invocation and saves progress after each chunk", async () => {
    const res = await (await call("Bearer s3cret")).json();
    expect(res.chunks).toBe(5);
    expect(res.caughtUp).toBe(false);
    expect(queries).toHaveLength(35);
    expect(store.get("meta/rollup")?.lastDay).toBe(res.lastDay);
  });
});
