import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const now = () => Math.floor(Date.now() / 1000);
const who = vi.hoisted(() => ({}) as Record<string, unknown>);
const demo = vi.hoisted(() => ({ on: false }));
const saved = vi.hoisted(() => [] as unknown[][]);
vi.mock("@/lib/server/admin-auth", () => ({ caller: async () => who }));
vi.mock("@/lib/demo", () => ({ DEMO_DISABLED_MESSAGE: "Action disabled in Demo Mode.", get DEMO_MODE() { return demo.on; } }));
vi.mock("@/lib/server/integrations", () => ({
  INTEGRATIONS: { EMAIL_FROM: {}, BREVO_API_KEY: {} },
  integrationStatus: async () => ({ fields: [], encryption: true, audit: [] }),
  saveIntegration: async (...args: unknown[]) => {
    if (args[1] === "bad") z.string().email().parse(args[1]);
    saved.push(args);
  },
}));

const { GET, PUT } = await import("./route");
const put = (body: unknown) => PUT(new Request("http://x", { method: "PUT", body: JSON.stringify(body) }));

describe("integrations API", () => {
  beforeEach(() => {
    for (const k of Object.keys(who)) delete who[k];
    Object.assign(who, { admin: true, developer: true, master: true, uid: "u1", authTime: now() });
    demo.on = false;
    saved.length = 0;
  });

  it("is a 404 for everyone but Master", async () => {
    who.master = false;
    expect((await GET(new Request("http://x"))).status).toBe(404);
    expect((await put({ field: "EMAIL_FROM", value: "a@b.co" })).status).toBe(404);
    who.master = true;
    expect((await GET(new Request("http://x"))).status).toBe(200);
  });

  it("needs a recent sign-in to write", async () => {
    who.authTime = now() - 3600;
    expect((await put({ field: "EMAIL_FROM", value: "a@b.co" })).status).toBe(401);
    expect(saved).toHaveLength(0);
  });

  it("is read-only in Demo Mode", async () => {
    demo.on = true;
    expect((await put({ field: "EMAIL_FROM", value: "a@b.co" })).status).toBe(403);
  });

  it("validates, then saves or clears with the caller's uid", async () => {
    expect((await put({ field: "FIREBASE_PRIVATE_KEY", value: "x" })).status).toBe(400);
    expect((await put({ field: "EMAIL_FROM", value: "bad" })).status).toBe(400);
    expect((await put({ field: "EMAIL_FROM", value: "a@b.co" })).status).toBe(200);
    expect((await put({ field: "BREVO_API_KEY", value: null })).status).toBe(200);
    expect(saved).toEqual([["EMAIL_FROM", "a@b.co", "u1"], ["BREVO_API_KEY", null, "u1"]]);
  });
});
