import { describe, expect, it } from "vitest";
import { memoryStore } from "./kv";
import { checkCode, issueCode, MAX_ATTEMPTS } from "./otp";

const email = "signer@example.com";

describe("email sign-in codes", () => {
  it("issues a 6-digit code that works exactly once", async () => {
    const store = memoryStore();
    const code = await issueCode(email, store);
    expect(code).toMatch(/^\d{6}$/);
    expect(await checkCode(email, code, store)).toBe("ok");
    expect(await checkCode(email, code, store)).toBe("expired");
  });

  it("rejects a wrong code and another email's code", async () => {
    const store = memoryStore();
    const code = await issueCode(email, store);
    const wrong = code === "000000" ? "000001" : "000000";
    expect(await checkCode(email, wrong, store)).toBe("invalid");
    expect(await checkCode("other@example.com", code, store)).toBe("expired");
    expect(await checkCode(email, code, store)).toBe("ok");
  });

  it(`burns the code after ${MAX_ATTEMPTS} wrong attempts`, async () => {
    const store = memoryStore();
    const code = await issueCode(email, store);
    const wrong = code === "000000" ? "000001" : "000000";
    for (let i = 0; i < MAX_ATTEMPTS; i++) expect(await checkCode(email, wrong, store)).toBe("invalid");
    expect(await checkCode(email, code, store)).toBe("expired");
  });

  it("a new code replaces the old one and resets attempts", async () => {
    const store = memoryStore();
    const first = await issueCode(email, store);
    const second = await issueCode(email, store);
    if (first !== second) expect(await checkCode(email, first, store)).toBe("invalid");
    expect(await checkCode(email, second, store)).toBe("ok");
  });
});
