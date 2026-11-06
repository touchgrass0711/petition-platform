import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");

// Minimal Firestore fake: docs keyed by path; transactions apply immediately; increments are summed.
const docs = new Map<string, Record<string, unknown>>();
const snap = (path: string) => ({
  exists: docs.has(path),
  id: path.split("/").at(-1)!,
  get: (k: string) => docs.get(path)?.[k],
  data: () => docs.get(path),
});
const doc = (path: string) => ({ path, id: path.split("/").at(-1)!, get: async () => snap(path), collection: (n: string) => ({ doc: (id: string) => doc(`${path}/${n}/${id}`) }) });
const apply = (path: string, data: Record<string, unknown>) => {
  const cur = { ...docs.get(path) };
  for (const [k, v] of Object.entries(data)) {
    const inc = (v as { operand?: number })?.operand;
    cur[k] = typeof inc === "number" ? Number(cur[k] ?? 0) + inc : v;
  }
  docs.set(path, cur);
};
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => ({
    collection: (n: string) => ({ doc: (id: string) => doc(`${n}/${id}`) }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async (ref: { path: string }) => snap(ref.path),
        update: (ref: { path: string }, data: Record<string, unknown>) => apply(ref.path, data),
        delete: (ref: { path: string }) => docs.delete(ref.path),
      }),
  }),
}));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { increment: (operand: number) => ({ operand }), serverTimestamp: () => "now" },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
// Bearer "<uid>" or "<uid>|<google photo>"; the real ownAvatar check runs.
vi.mock("@/lib/server/signer-auth", async () => ({
  ownAvatar: (await vi.importActual<typeof import("@/lib/server/signer-auth")>("@/lib/server/signer-auth")).ownAvatar,
  signerClaims: async (req: Request) => {
    const [uid, photo = null] = (req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "").split("|");
    return uid ? { uid, photo } : null;
  },
}));

const { DELETE, GET, PATCH } = await import("./route");
const req = (method: string, uid: string | null, body?: object) =>
  new NextRequest(`http://localhost/api/comments/mine?campaign=default`, {
    method,
    headers: uid ? { authorization: `Bearer ${uid}` } : {},
    body: body && JSON.stringify({ campaign: "default", ...body }),
  });

describe("/api/comments/mine (live)", () => {
  beforeEach(() => {
    docs.clear();
    docs.set("petitions/default", { signatureCount: 10 });
    docs.set("petitions/default/signers/alex", { commentId: "c1" });
    docs.set("petitions/default/comments/c1", { name: "Alex", message: "Count me in", pinned: false, createdAt: { toDate: () => new Date(0) } });
    docs.set("petitions/default/comments/c2", { name: "Sam", message: "Mine", pinned: false });
  });

  it("requires sign-in", async () => {
    expect((await GET(req("GET", null))).status).toBe(401);
    expect((await DELETE(req("DELETE", null))).status).toBe(401);
  });

  it("returns only the caller's own signature", async () => {
    const res = await GET(req("GET", "alex"));
    expect((await res.json()).comment).toMatchObject({ id: "c1", name: "Alex" });
    expect((await GET(req("GET", "sam"))).status).toBe(404);
  });

  it("edits the caller's comment with the signing rules, never another one", async () => {
    expect((await PATCH(req("PATCH", "alex", { name: "", anonymous: true, message: "Still in", id: "c2" }))).status).toBe(200);
    expect(docs.get("petitions/default/comments/c1")).toMatchObject({ name: "Anonymous", message: "Still in" });
    expect(docs.get("petitions/default/comments/c2")).toMatchObject({ name: "Sam", message: "Mine" });
    expect((await PATCH(req("PATCH", "alex", { name: "", anonymous: false, message: "x" }))).status).toBe(400);
    expect((await PATCH(req("PATCH", "sam", { name: "Sam", anonymous: false, message: "hi" }))).status).toBe(404);
  });

  it("lets the signer pick their own Google photo, a colour or initials, never another URL", async () => {
    const photo = "https://lh3.googleusercontent.com/a/alex=s96-c";
    const body = { name: "Alex", anonymous: false, message: "Count me in" };
    expect((await PATCH(req("PATCH", `alex|${photo}`, { ...body, avatarUrl: photo }))).status).toBe(200);
    expect(docs.get("petitions/default/comments/c1")).toMatchObject({ avatarUrl: photo, avatarPreset: null });
    expect((await PATCH(req("PATCH", "alex", { ...body, avatarUrl: "https://lh3.googleusercontent.com/a/someone-else" }))).status).toBe(400);
    expect((await PATCH(req("PATCH", `alex|${photo}`, { ...body, avatarUrl: null, avatarPreset: 2 }))).status).toBe(200);
    expect(docs.get("petitions/default/comments/c1")).toMatchObject({ avatarUrl: null, avatarPreset: 2 });
  });

  it("deletes comment and signer doc and decrements the count once", async () => {
    expect((await DELETE(req("DELETE", "alex"))).status).toBe(200);
    expect(docs.has("petitions/default/comments/c1")).toBe(false);
    expect(docs.has("petitions/default/signers/alex")).toBe(false);
    expect(docs.get("petitions/default")!.signatureCount).toBe(9);
    expect((await DELETE(req("DELETE", "alex"))).status).toBe(404);
    expect(docs.get("petitions/default")!.signatureCount).toBe(9);
    expect(docs.has("petitions/default/comments/c2")).toBe(true);
  });
});
