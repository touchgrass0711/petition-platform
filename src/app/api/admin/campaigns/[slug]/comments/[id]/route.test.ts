import { describe, expect, it, vi } from "vitest";

vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
const revalidated = vi.hoisted(() => [] as string[]);
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => void revalidated.push(p) }));
vi.mock("@/lib/server/admin-auth", () => ({ guard: async () => null }));

// Minimal fake of petitions/{slug}/comments: docs keyed "slug/id", updates merge shallowly.
const docs = new Map<string, Record<string, unknown>>();
const snap = (key: string) => ({ id: key.split("/")[1], exists: docs.has(key), get: (k: string) => docs.get(key)?.[k], ref: { key } });
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => ({
    collection: () => ({
      doc: (slug: string) => ({
        collection: () => ({
          doc: (id: string) => ({ key: `${slug}/${id}` }),
          where: (field: string, _op: string, value: unknown) => ({ slug, field, value }),
        }),
      }),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async (q: { key?: string; slug?: string; field?: string; value?: unknown }) =>
          q.key !== undefined
            ? snap(q.key)
            : { docs: [...docs.keys()].filter((k) => k.startsWith(`${q.slug}/`) && docs.get(k)![q.field!] === q.value).map(snap) },
        update: (r: { key: string }, data: Record<string, unknown>) => docs.set(r.key, { ...docs.get(r.key), ...data }),
      }),
  }),
}));

const { PATCH } = await import("./route");
const id = (n: number) => `c${n}`.padEnd(20, "x");
const patch = (slug: string, cid: string, body: unknown) =>
  PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ slug, id: cid }) });

describe("PATCH campaign comment", () => {
  it("caps pins per campaign, not across campaigns", async () => {
    for (let n = 0; n < 4; n++) docs.set(`camp-a/${id(n)}`, { pinned: n < 3, hidden: false });
    docs.set(`camp-b/${id(9)}`, { pinned: false, hidden: false });
    expect((await patch("camp-a", id(3), { pinned: true })).status).toBe(409);
    expect((await patch("camp-b", id(9), { pinned: true })).status).toBe(200);
    expect(revalidated).toContain("/c/camp-b");
    expect((await patch("camp-a", id(0), { pinned: false })).status).toBe(200);
    expect((await patch("camp-a", id(3), { pinned: true })).status).toBe(200);
  });

  it("hiding unpins, and hidden comments can't be pinned", async () => {
    expect((await patch("camp-a", id(3), { hidden: true })).status).toBe(200);
    expect(docs.get(`camp-a/${id(3)}`)).toEqual({ pinned: false, hidden: true });
    expect((await patch("camp-a", id(3), { pinned: true })).status).toBe(409);
  });

  it("rejects bad input and unknown comments", async () => {
    expect((await patch("camp-a", "short", { pinned: true })).status).toBe(400);
    expect((await patch("camp-a", id(1), { pinned: true, hidden: true })).status).toBe(400);
    expect((await patch("camp-a", id(7), { pinned: true })).status).toBe(404);
  });
});
