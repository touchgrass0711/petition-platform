import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { slugSchema } from "@/lib/campaign-schema";
import { DEMO_MODE } from "@/lib/demo";
import { adminDb } from "@/lib/firebase/admin";
import { commentInputSchema } from "@/lib/schemas";
import { allowComment } from "@/lib/server/ratelimit";
import { ownAvatar, signerClaims } from "@/lib/server/signer-auth";
import { AVATAR_UPLOADS } from "@/lib/tiny-avatar";

// A signer's own signature on one campaign. Ownership comes only from the verified ID token: the comment is
// found through signers/{uid}, written in the signing transaction, never from an id the client sends.

type Ctx = { uid: string; photo: string | null; slug: string };

async function context(req: NextRequest, slugInput: unknown): Promise<Ctx | NextResponse> {
  // Demo Mode edits and deletes in the browser only.
  if (DEMO_MODE) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const slug = slugSchema.safeParse(slugInput);
  if (!slug.success) return NextResponse.json({ error: "Invalid campaign" }, { status: 400 });
  const signer = await signerClaims(req);
  if (!signer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return { ...signer, slug: slug.data };
}

const refs = ({ uid, slug }: Ctx) => {
  const petition = adminDb().collection("petitions").doc(slug);
  return { petition, signer: petition.collection("signers").doc(uid), comments: petition.collection("comments") };
};

const NOT_SIGNED = () => NextResponse.json({ error: "You have not signed this petition." }, { status: 404 });

function revalidate(slug: string) {
  revalidatePath("/");
  revalidatePath(`/c/${slug}`);
}

export async function GET(req: NextRequest) {
  const ctx = await context(req, req.nextUrl.searchParams.get("campaign"));
  if (ctx instanceof NextResponse) return ctx;
  const { signer, comments } = refs(ctx);
  const s = await signer.get();
  if (!s.exists) return NOT_SIGNED();
  const c = await comments.doc(s.get("commentId")).get();
  if (!c.exists) return NOT_SIGNED();
  const d = c.data()!;
  return NextResponse.json(
    { comment: { id: c.id, name: d.name, message: d.message, avatarUrl: d.avatarUrl ?? null, avatarPreset: d.avatarPreset ?? null, pinned: Boolean(d.pinned), createdAt: d.createdAt.toDate().toISOString() } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PATCH(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  const ctx = await context(req, raw?.campaign);
  if (ctx instanceof NextResponse) return ctx;
  if (!(await allowComment(ctx.uid))) return NextResponse.json({ error: "Too many changes. Try again in a minute." }, { status: 429 });
  // Same rules as signing, avatar included.
  const parsed = commentInputSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { name, message, avatarUrl, avatarPreset } = parsed.data;
  const uploaded = avatarUrl?.startsWith("data:");
  if (!ownAvatar(avatarUrl, ctx.photo) || (uploaded && !AVATAR_UPLOADS)) return NextResponse.json({ error: "Invalid avatar" }, { status: 400 });

  const db = adminDb();
  const { signer, comments } = refs(ctx);
  const id = await db.runTransaction(async (tx) => {
    const s = await tx.get(signer);
    if (!s.exists) return null;
    const ref = comments.doc(s.get("commentId"));
    if (!(await tx.get(ref)).exists) return null;
    // Replaces the old avatar, so a signer's stored data never grows with changes.
    tx.update(ref, { name, message, avatarUrl, avatarPreset: avatarUrl ? null : avatarPreset, editedAt: FieldValue.serverTimestamp() });
    return ref.id;
  });
  if (!id) return NOT_SIGNED();
  revalidate(ctx.slug);
  return NextResponse.json({ id, name, message, avatarUrl, avatarPreset });
}

export async function DELETE(req: NextRequest) {
  const ctx = await context(req, req.nextUrl.searchParams.get("campaign"));
  if (ctx instanceof NextResponse) return ctx;
  if (!(await allowComment(ctx.uid))) return NextResponse.json({ error: "Too many changes. Try again in a minute." }, { status: 429 });

  const db = adminDb();
  const { petition, signer, comments } = refs(ctx);
  // One transaction: the signer doc, comment and count change together, so a retry can't double-decrement.
  const done = await db.runTransaction(async (tx) => {
    const s = await tx.get(signer);
    if (!s.exists) return false;
    tx.delete(comments.doc(s.get("commentId")));
    tx.delete(signer);
    // goalReachedAt and the daily rollup stay: they record what happened, not the current total.
    tx.update(petition, { signatureCount: FieldValue.increment(-1) });
    return true;
  });
  if (!done) return NOT_SIGNED();
  revalidate(ctx.slug);
  return NextResponse.json({ ok: true });
}
