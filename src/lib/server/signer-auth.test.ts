import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyIdToken = vi.fn();
const createCustomToken = vi.fn(async (uid: string, claims: object) => JSON.stringify({ uid, claims }));
vi.mock("firebase-admin/auth", () => ({ getAuth: () => ({ verifyIdToken, createCustomToken }) }));
vi.mock("@/lib/firebase/admin", () => ({ adminDb: () => ({}) }));
vi.stubEnv("SIGNER_ID_SECRET", "test-secret");

const { customTokenFor, ownAvatar, signerUid, uidFor, verifyGoogleToken } = await import("./signer-auth");
const req = (token?: string) => new Request("http://x", { headers: token ? { authorization: `Bearer ${token}` } : {} });

describe("signer auth", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  it("derives a stable uid that is not the plain sha256 of the email", () => {
    const email = "signer@example.com";
    expect(uidFor(email)).toBe(uidFor(email));
    expect(uidFor(email)).toMatch(/^e_[0-9a-f]{64}$/);
    expect(uidFor(email)).not.toContain(createHash("sha256").update(email).digest("hex"));
  });

  it("mints tokens with the signer claim", async () => {
    expect(JSON.parse(await customTokenFor("a@b.co"))).toEqual({ uid: uidFor("a@b.co"), claims: { signer: true } });
  });

  it("accepts only tokens carrying the signer claim", async () => {
    verifyIdToken.mockResolvedValue({ uid: "e_1", signer: true });
    expect(await signerUid(req("t"))).toBe("e_1");
    verifyIdToken.mockResolvedValue({ uid: "password-signup-user" });
    expect(await signerUid(req("t"))).toBeNull();
  });

  it("rejects a missing or invalid token", async () => {
    expect(await signerUid(req())).toBeNull();
    verifyIdToken.mockImplementation(async () => {
      throw new Error("bad");
    });
    expect(await signerUid(req("t"))).toBeNull();
  });

  describe("Google ID tokens", () => {
    const google = { uid: "g1", email: "Alex@Example.com", email_verified: true, firebase: { sign_in_provider: "google.com" } };

    it("accepts a verified Google account and lower-cases the email, so it maps to the email-code uid", async () => {
      verifyIdToken.mockResolvedValue(google);
      const result = await verifyGoogleToken("t");
      expect(result).toEqual({ email: "alex@example.com", uid: "g1", photo: null });
      expect(uidFor(result!.email)).toBe(uidFor("alex@example.com"));
    });

    it("rejects other providers, unverified or missing emails", async () => {
      for (const d of [
        { ...google, firebase: { sign_in_provider: "password" } },
        { ...google, firebase: { sign_in_provider: "custom" } },
        { ...google, email_verified: false },
        { ...google, email: undefined },
      ]) {
        verifyIdToken.mockResolvedValue(d);
        expect(await verifyGoogleToken("t")).toBeNull();
      }
    });

    it("rejects tokens firebase-admin refuses (wrong audience, expired, bad signature)", async () => {
      verifyIdToken.mockRejectedValue(new Error("auth/id-token-expired"));
      expect(await verifyGoogleToken("t")).toBeNull();
    });
  });

  it("carries the Google photo in the signer token and only lets that photo be used", async () => {
    const photo = "https://lh3.googleusercontent.com/a/x=s96-c";
    expect(JSON.parse(await customTokenFor("a@b.co", photo)).claims).toEqual({ signer: true, photo });
    expect(JSON.parse(await customTokenFor("a@b.co", "https://evil.example/x.png")).claims).toEqual({ signer: true });
    expect(ownAvatar(photo, photo)).toBe(true);
    expect(ownAvatar(photo, null)).toBe(false);
    expect(ownAvatar(null, null)).toBe(true);
    expect(ownAvatar("data:image/webp;base64,AAAA", null)).toBe(true);
  });
});
