import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => {
    throw new Error("Demo Mode must not touch Firestore");
  },
  isFirebaseAdminConfigured: false,
  petitionId: () => "default",
}));

const { POST } = await import("./route");

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/comments", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/comments in Demo Mode", () => {
  it("returns the new comment without writing", async () => {
    const res = await post({ name: " Signer ", message: "Count me in", anonymous: false, turnstileToken: "tok" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.demo).toBe(true);
    expect(body.comment).toMatchObject({ name: "Signer", message: "Count me in", pinned: false });
  });

  it("signs as Anonymous by default", async () => {
    const res = await post({ name: "Real Name", message: "Count me in", turnstileToken: "tok" });
    expect((await res.json()).comment.name).toBe("Anonymous");
  });

  it("answers a filled honeypot like a success", async () => {
    const res = await post({ name: "", message: "Count me in", website: "spam.example", turnstileToken: "tok" });
    expect(res.status).toBe(201);
  });

  it("rejects a blank comment", async () => {
    const res = await post({ name: "Signer", message: "  ", turnstileToken: "tok" });
    expect(res.status).toBe(400);
    expect((await res.json()).issues.message).toBeDefined();
  });

  it("rejects malformed JSON", async () => {
    const res = await POST(new NextRequest("http://localhost/api/comments", { method: "POST", body: "{" }));
    expect(res.status).toBe(400);
  });
});

const { GET } = await import("./route");
const get = (query: string) => GET(new NextRequest(`http://localhost/api/comments${query}`));

describe("GET /api/comments cursor", () => {
  it("serves the first page and a valid next page", async () => {
    const first = await (await get("")).json();
    expect(first.comments).toHaveLength(10);
    expect((await get(`?cursor=${first.nextCursor}`)).status).toBe(200);
  });

  it("rejects cursors that are not document IDs", async () => {
    expect((await get("?cursor=random-cache-buster")).status).toBe(400);
    expect((await get("?cursor=")).status).toBe(400);
  });

  it("follows the signing window in Demo Mode too", async () => {
    const body = { name: "", message: "Count me in", turnstileToken: "tok" };
    expect((await post({ ...body, campaign: "scheduled-campaign" })).status).toBe(403);
    expect((await post({ ...body, campaign: "closed-campaign" })).status).toBe(403);
    expect((await post({ ...body, campaign: "achieved-campaign" })).status).toBe(201);
    expect((await post({ ...body, campaign: "missing-campaign" })).status).toBe(404);
  });
});
