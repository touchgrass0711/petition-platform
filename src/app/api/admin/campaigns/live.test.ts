import { describe, expect, it, vi } from "vitest";

vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/server/settings", () => ({ getSettings: async () => ({ mode: "multiple", disabled: [] }) }));
vi.mock("@/lib/server/admin-auth", () => ({ isAdmin: async () => true, guard: async () => null }));
const single = vi.hoisted(() => ({ slug: null as string | null }));
vi.mock("@/lib/petition", async (orig) => ({ ...(await orig<typeof import("@/lib/petition")>()), singleModeSlug: async () => single.slug }));

// Minimal Firestore fake: top-level docs by id; updates merge shallowly.
const docs = new Map<string, Record<string, unknown>>();
const snap = (id: string) => ({ id, exists: docs.has(id), data: () => docs.get(id), get: (k: string) => docs.get(id)?.[k], ref: ref(id) });
function ref(id: string) {
  return {
    id,
    get: async () => snap(id),
    create: async (data: Record<string, unknown>) => {
      if (docs.has(id)) throw Object.assign(new Error("exists"), { code: 6 });
      docs.set(id, data);
    },
  };
}
const merge = (r: { id: string }, data: Record<string, unknown>) => docs.set(r.id, { ...docs.get(r.id), ...data });
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => ({
    collection: () => ({
      doc: ref,
      where: (field: string, _op: string, value: unknown) => ({ field, value }),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async (q: { id?: string; field?: string; value?: unknown }) =>
          q.id !== undefined ? snap(q.id) : { docs: [...docs.keys()].filter((id) => docs.get(id)![q.field!] === q.value).map(snap) },
        update: merge,
      }),
  }),
  isFirebaseAdminConfigured: true,
  petitionId: () => "default",
}));

const list = await import("./route");
const one = await import("./[slug]/route");
const req = (method: string, body?: unknown) => new Request("http://x", { method, body: JSON.stringify(body) });
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const input = (slug: string, patch: Record<string, unknown> = {}) => ({
  slug,
  title: "Campaign Title",
  description: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }] },
  goal: 100,
  start: "2026-11-10T19:00",
  end: null,
  timeZone: "Asia/Jakarta",
  ...patch,
});

describe("admin campaign API in live mode", () => {
  it("creates a draft with UTC instants and refuses a taken slug", async () => {
    expect((await list.POST(req("POST", input("first")))).status).toBe(201);
    const stored = docs.get("first")!;
    expect(stored.status).toBe("draft");
    expect((stored.startAt as { toDate(): Date }).toDate().toISOString()).toBe("2026-11-10T12:00:00.000Z");
    expect(stored.descriptionText).toBe("Hi");
    expect((await list.POST(req("POST", input("first")))).status).toBe(409);
    expect((await list.POST(req("POST", input("bad slug")))).status).toBe(400);
  });

  it("edits without changing the slug, and updates goalReachedAt with the goal", async () => {
    docs.set("edit-me", { ...docs.get("first"), signatureCount: 150, goalReachedAt: null });
    expect((await one.PUT(req("PUT", input("other")), ctx("edit-me"))).status).toBe(400);
    expect((await one.PUT(req("PUT", input("edit-me", { goal: 120 })), ctx("edit-me"))).status).toBe(200);
    expect(docs.get("edit-me")!.goalReachedAt).not.toBeNull();
    expect((await one.PUT(req("PUT", input("edit-me", { goal: 500 })), ctx("edit-me"))).status).toBe(200);
    expect(docs.get("edit-me")!.goalReachedAt).toBeNull();
    expect((await one.PUT(req("PUT", input("missing")), ctx("missing"))).status).toBe(404);
    single.slug = "home"; // single-campaign mode: only the home page campaign is editable
    expect((await one.PUT(req("PUT", input("edit-me", { goal: 120 })), ctx("edit-me"))).status).toBe(403);
    single.slug = null;
  });

  it("keeps at most one featured campaign and never features a deleted one", async () => {
    docs.set("aaa", { featured: true, deletedAt: null });
    docs.set("bbb", { featured: false, deletedAt: null });
    expect((await one.PATCH(req("PATCH", { featured: true }), ctx("bbb"))).status).toBe(200);
    expect([docs.get("aaa")!.featured, docs.get("bbb")!.featured]).toEqual([false, true]);
    expect((await one.PATCH(req("PATCH", { deleted: true }), ctx("bbb"))).status).toBe(200);
    expect(docs.get("bbb")!.featured).toBe(false);
    expect((await one.PATCH(req("PATCH", { featured: true }), ctx("bbb"))).status).toBe(409);
    expect((await one.PATCH(req("PATCH", { deleted: false }), ctx("bbb"))).status).toBe(200);
    expect(docs.get("bbb")!.deletedAt).toBeNull();
    expect((await one.PATCH(req("PATCH", { featured: true, deleted: true }), ctx("bbb"))).status).toBe(400);
  });
});
