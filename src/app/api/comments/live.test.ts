import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// Live mode: DEMO_MODE is read at import time, so set the env before importing the route.
vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");

// Minimal Firestore fake: docs keyed by path, transactions applied immediately. Updates are recorded, not applied.
const docs = new Map<string, Record<string, unknown>>();
const updates: { path: string; data: Record<string, unknown> }[] = [];
const doc = (path: string) => ({
  path,
  id: path.split("/").at(-1)!,
  collection: (name: string) => ({ doc: (id = `c${docs.size}${Math.random().toString(36).slice(2, 8)}`) => doc(`${path}/${name}/${id}`) }),
});
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => ({
    collection: (name: string) => ({ doc: (id: string) => doc(`${name}/${id}`) }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async (ref: { path: string }) => ({ exists: docs.has(ref.path), data: () => docs.get(ref.path) }),
        create: (ref: { path: string }, data: Record<string, unknown>) => docs.set(ref.path, data),
        set: (ref: { path: string }, data: Record<string, unknown>) => docs.set(ref.path, data),
        update: (ref: { path: string }, data: Record<string, unknown>) => updates.push({ path: ref.path, data }),
      }),
  }),
  isFirebaseAdminConfigured: true,
  petitionId: () => "default",
}));
vi.mock("@/lib/server/turnstile", () => ({ verifyTurnstile: async () => true }));
// Bearer "<uid>" or "<uid>|<google photo>"; the real ownAvatar check runs.
vi.mock("@/lib/server/signer-auth", async () => ({
  ownAvatar: (await vi.importActual<typeof import("@/lib/server/signer-auth")>("@/lib/server/signer-auth")).ownAvatar,
  signerClaims: async (req: Request) => {
    const [uid, photo = null] = (req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "").split("|");
    return uid ? { uid, photo } : null;
  },
}));

const { Timestamp } = await import("firebase-admin/firestore");
const { POST } = await import("./route");

const DAY = 86_400_000;
const ts = (offsetDays: number) => Timestamp.fromMillis(Date.now() + offsetDays * DAY);
const campaign = (fields: Record<string, unknown> = {}) => ({
  title: "Campaign Title",
  goal: 10,
  signatureCount: 0,
  status: "published",
  startAt: ts(-1),
  endAt: ts(1),
  goalReachedAt: null,
  deletedAt: null,
  ...fields,
});
// The pre-campaign doc: no status or dates, so it is live and open-ended.
docs.set("petitions/default", { title: "Campaign Title", goal: 10000, signatureCount: 8452 });
const post = (body: Record<string, unknown>, uid?: string) =>
  POST(
    new NextRequest("http://localhost/api/comments", {
      method: "POST",
      headers: uid ? { authorization: `Bearer ${uid}` } : {},
      body: JSON.stringify({ message: "Count me in", name: "", turnstileToken: "tok", ...body }),
    }),
  );

describe("POST /api/comments in live mode", () => {
  it("requires a signed-in signer", async () => {
    expect((await post({})).status).toBe(401);
  });

  it("allows one signature per account", async () => {
    const first = await post({}, "uid-1");
    expect(first.status).toBe(201);
    expect((await first.json()).demo).toBe(false);
    expect(docs.has("petitions/default/signers/uid-1")).toBe(true);
    expect((await post({}, "uid-1")).status).toBe(409);
    expect((await post({}, "uid-2")).status).toBe(201);
  });

  it("accepts only a tiny inline avatar and stores it on the comment", async () => {
    const tiny = `data:image/webp;base64,${Buffer.from("RIFF\0\0\0\0WEBPVP8 ").toString("base64")}`;
    expect((await post({ avatarUrl: "https://firebasestorage.googleapis.com/v0/b/bucket/o/avatars%2Fuid-3%2Fa.webp" }, "uid-3")).status).toBe(400);
    expect((await post({ avatarUrl: "https://evil.example/a.png" }, "uid-3")).status).toBe(400);
    const res = await post({ avatarUrl: tiny }, "uid-3");
    expect(res.status).toBe(201);
    expect((await res.json()).comment.avatarUrl).toBe(tiny);
  });

  it("refuses outside the Live window, for drafts, deleted and unknown campaigns", async () => {
    docs.set("petitions/scheduled", campaign({ startAt: ts(1), endAt: ts(2) }));
    docs.set("petitions/ended", campaign({ startAt: ts(-2), endAt: ts(-1) }));
    docs.set("petitions/draft-one", campaign({ status: "draft" }));
    docs.set("petitions/deleted", campaign({ deletedAt: ts(-1) }));
    for (const slug of ["scheduled", "ended", "draft-one", "deleted"]) {
      expect((await post({ campaign: slug }, `uid-${slug}`)).status).toBe(403);
      expect(docs.has(`petitions/${slug}/signers/uid-${slug}`)).toBe(false);
    }
    expect((await post({ campaign: "nope" }, "uid-x")).status).toBe(404);
    expect((await post({ campaign: "../default" }, "uid-x")).status).toBe(400);
  });

  it("keeps signing open past the goal and sets goalReachedAt only on the signature that reaches it", async () => {
    docs.set("petitions/near", campaign({ signatureCount: 8 }));
    const goalSet = () => updates.filter((u) => u.path === "petitions/near" && "goalReachedAt" in u.data).length;
    expect((await post({ campaign: "near" }, "n1")).status).toBe(201);
    expect(goalSet()).toBe(0);
    docs.set("petitions/near", campaign({ signatureCount: 9 }));
    expect((await post({ campaign: "near" }, "n2")).status).toBe(201);
    expect(goalSet()).toBe(1);
    docs.set("petitions/near", campaign({ signatureCount: 10, goalReachedAt: ts(0) }));
    expect((await post({ campaign: "near" }, "n3")).status).toBe(201);
    expect(goalSet()).toBe(1);
  });

  it("writes the comment, signer and daily rollup under the campaign", async () => {
    docs.set("petitions/rolled", campaign());
    expect((await post({ campaign: "rolled" }, "r1")).status).toBe(201);
    const paths = [...docs.keys()].filter((p) => p.startsWith("petitions/rolled/"));
    expect(paths).toContain("petitions/rolled/signers/r1");
    expect(paths).toContain(`petitions/rolled/daily/${new Date().toISOString().slice(0, 10)}`);
    expect(paths.some((p) => p.startsWith("petitions/rolled/comments/"))).toBe(true);
  });
});
