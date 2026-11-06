import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/admin-auth", () => ({ isAdmin: async () => true, guard: async () => null }));
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => {
    throw new Error("Demo Mode must not touch Firestore");
  },
  petitionId: () => "default",
}));

const { PATCH } = await import("./route");

describe("PATCH /api/admin/petition in Demo Mode", () => {
  it("refuses the write even for an admin", async () => {
    const res = await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ goal: 5 }) }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Action disabled in Demo Mode.");
  });
});
