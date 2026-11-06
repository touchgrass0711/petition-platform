import { describe, expect, it, vi } from "vitest";

const admin = vi.hoisted(() => ({ ok: true }));
vi.mock("@/lib/server/admin-auth", () => ({
  isAdmin: async () => admin.ok,
  guard: async () => (admin.ok ? null : Response.json({ error: "Unauthorized" }, { status: 401 })),
}));
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => {
    throw new Error("Demo Mode must not touch Firestore");
  },
  isFirebaseAdminConfigured: false,
  petitionId: () => "default",
}));

vi.mock("@/lib/server/settings", () => ({ getSettings: async () => ({ mode: "multiple", disabled: [] }) }));

const list = await import("./route");
const one = await import("./[slug]/route");
const ctx = { params: Promise.resolve({ slug: "default" }) };
const req = (method: string, body?: unknown) => new Request("http://x", { method, body: body === undefined ? undefined : JSON.stringify(body) });

describe("admin campaign API in Demo Mode", () => {
  it("lists every campaign for an admin, including drafts", async () => {
    const res = await list.GET(req("GET"));
    expect(res.status).toBe(200);
    expect((await res.json()).campaigns).toHaveLength(5);
  });

  it("returns one campaign for the edit form", async () => {
    const res = await one.GET(req("GET"), ctx);
    expect((await res.json()).campaign.slug).toBe("default");
    expect((await one.GET(req("GET"), { params: Promise.resolve({ slug: "nope-nope" }) })).status).toBe(404);
  });

  it("refuses every write with the Demo Mode message, before validation or Firestore", async () => {
    for (const res of [
      await list.POST(req("POST", {})),
      await one.PUT(req("PUT", {}), ctx),
      await one.PATCH(req("PATCH", { featured: true }), ctx),
      await one.PATCH(req("PATCH", { deleted: true }), ctx),
    ]) {
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("Action disabled in Demo Mode.");
    }
  });

  it("requires an admin for reads and writes", async () => {
    admin.ok = false;
    expect((await list.GET(req("GET"))).status).toBe(401);
    expect((await list.POST(req("POST", {}))).status).toBe(401);
    expect((await one.PATCH(req("PATCH", { deleted: true }), ctx)).status).toBe(401);
    admin.ok = true;
  });
});
