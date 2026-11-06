import { beforeEach, describe, expect, it, vi } from "vitest";

const who = vi.hoisted(() => ({ admin: true, developer: false }));
const saved = vi.hoisted(() => [] as unknown[]);
vi.mock("@/lib/server/admin-auth", () => ({ caller: async () => who }));
vi.mock("@/lib/server/settings", () => ({
  getSettings: async () => ({ mode: "multiple", disabled: [] }),
  saveSettings: async (s: unknown) => void saved.push(s),
}));

const { GET, PUT } = await import("./route");
const put = (body: unknown) => PUT(new Request("http://x", { method: "PUT", body: JSON.stringify(body) }));

describe("settings API", () => {
  beforeEach(() => {
    Object.assign(who, { admin: true, developer: false });
    saved.length = 0;
  });

  it("lets admins read without revealing the developer role", async () => {
    expect(await (await GET(new Request("http://x"))).json()).toEqual({ settings: { mode: "multiple", disabled: [] } });
    who.developer = true;
    expect((await (await GET(new Request("http://x"))).json()).developer).toBe(true);
    who.developer = false;
    who.admin = false;
    expect((await GET(new Request("http://x"))).status).toBe(401);
  });

  it("refuses writes from admins who are not developers", async () => {
    const res = await put({ mode: "single", disabled: [] });
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toMatch(/master|developer/i);
    expect(saved).toHaveLength(0);
  });

  it("validates and saves for a developer", async () => {
    who.developer = true;
    expect((await put({ mode: "single", disabled: ["bogus"] })).status).toBe(400);
    expect((await put({ mode: "single", disabled: ["metrics"] })).status).toBe(200);
    expect(saved).toEqual([{ mode: "single", disabled: ["metrics"] }]);
  });
});
