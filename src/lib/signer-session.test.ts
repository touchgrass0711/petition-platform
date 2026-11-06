import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.stubGlobal("sessionStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
});
vi.stubGlobal("window", { dispatchEvent: () => true });

const { markSigned, readSigner, signIn, unmarkSigned } = await import("./signer-session");

describe("signer session", () => {
  beforeEach(() => store.clear());

  it("remembers a signature across sign-out, per person", () => {
    signIn("alex.rivera@example.com");
    markSigned(readSigner()!, "save-the-park");
    store.delete("signer"); // sign out
    signIn("alex.rivera@example.com");
    expect(readSigner()!.signed).toEqual(["save-the-park"]);
    signIn("sam.okafor@example.com");
    expect(readSigner()!.signed).toEqual([]);
  });

  it("lets the same person sign again after deleting their signature", () => {
    signIn("alex.rivera@example.com");
    markSigned(readSigner()!, "save-the-park");
    unmarkSigned(readSigner()!, "save-the-park");
    store.delete("signer");
    signIn("alex.rivera@example.com");
    expect(readSigner()!.signed).toEqual([]);
  });
});
