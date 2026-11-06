import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Live mode with Google enabled (Demo Mode is read at import time; the Google flag per request).
vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
vi.stubEnv("NEXT_PUBLIC_GOOGLE_SIGNIN", "true");
vi.stubEnv("SIGNER_ID_SECRET", "test-secret");

const verifyIdToken = vi.fn();
const deleteUser = vi.fn(async () => {});
const createCustomToken = vi.fn(async (uid: string) => `custom:${uid}`);
vi.mock("firebase-admin/auth", () => ({ getAuth: () => ({ verifyIdToken, createCustomToken, deleteUser }) }));
vi.mock("@/lib/firebase/admin", () => ({ adminDb: () => ({}), isFirebaseAdminConfigured: false }));

const { POST } = await import("./route");
const { uidFor } = await import("@/lib/server/signer-auth");
const call = (body: unknown) => POST(new NextRequest("http://localhost/api/auth/google", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/auth/google (live)", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    deleteUser.mockClear();
    createCustomToken.mockClear();
  });

  it("swaps a verified Google token for the same signer token as the email code, and drops the Google user", async () => {
    verifyIdToken.mockResolvedValue({ uid: "g1", email: "alex@example.com", email_verified: true, firebase: { sign_in_provider: "google.com" } });
    const res = await call({ idToken: "t" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, email: "alex@example.com", photo: null, token: `custom:${uidFor("alex@example.com")}` });
    expect(deleteUser).toHaveBeenCalledWith("g1");
  });

  it("still signs in when the Google user cleanup fails", async () => {
    verifyIdToken.mockResolvedValue({ uid: "g1", email: "a@b.co", email_verified: true, firebase: { sign_in_provider: "google.com" } });
    deleteUser.mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    expect((await call({ idToken: "t" })).status).toBe(200);
  });

  it("refuses unverified or forged tokens and malformed input", async () => {
    verifyIdToken.mockResolvedValue({ uid: "g1", email: "a@b.co", email_verified: false, firebase: { sign_in_provider: "google.com" } });
    expect((await call({ idToken: "t" })).status).toBe(401);
    verifyIdToken.mockRejectedValue(new Error("bad signature"));
    expect((await call({ idToken: "t" })).status).toBe(401);
    expect((await call({})).status).toBe(400);
    expect(createCustomToken).not.toHaveBeenCalled();
  });
});
