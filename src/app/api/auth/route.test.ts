import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

const { POST: requestCode } = await import("./code/route");
const { POST: verify } = await import("./verify/route");

const call = (fn: (r: NextRequest) => Promise<Response>, path: string, body: unknown) =>
  fn(new NextRequest(`http://localhost/api/auth/${path}`, { method: "POST", body: JSON.stringify(body) }));

describe("email-code sign-in in Demo Mode", () => {
  it("returns the code on screen instead of emailing it, then verifies it", async () => {
    const res = await call(requestCode, "code", { email: " Signer@Example.com ", turnstileToken: "tok" });
    expect(res.status).toBe(200);
    const { demo, demoCode } = await res.json();
    expect(demo).toBe(true);
    expect(demoCode).toMatch(/^\d{6}$/);

    const ok = await call(verify, "verify", { email: "signer@example.com", code: demoCode });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, demo: true, email: "signer@example.com" });
  });

  it("rejects a bad email and a malformed code", async () => {
    expect((await call(requestCode, "code", { email: "nope", turnstileToken: "tok" })).status).toBe(400);
    expect((await call(verify, "verify", { email: "a@b.co", code: "12ab56" })).status).toBe(400);
  });

  it("treats a code that was never issued as expired", async () => {
    expect((await call(verify, "verify", { email: "nobody@example.com", code: "123456" })).status).toBe(410);
  });
});
