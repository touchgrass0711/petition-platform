import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { slugSchema } from "@/lib/campaign-schema";
import { applyModeration, moderationSchema } from "@/lib/comment-moderation";
import { DEMO_DISABLED_MESSAGE, DEMO_MODE } from "@/lib/demo";
import { adminDb } from "@/lib/firebase/admin";
import { guard } from "@/lib/server/admin-auth";

const COMMENT_ID = /^[A-Za-z0-9]{20}$/;

/** Pin / unpin (at most MAX_PINNED per campaign) or hide / unhide one comment of one campaign. */
export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const denied = await guard(req, "comments");
  if (denied) return denied;
  if (DEMO_MODE) return NextResponse.json({ error: DEMO_DISABLED_MESSAGE }, { status: 403 });
  const { slug: rawSlug, id } = await params;
  const slug = slugSchema.safeParse(rawSlug);
  const change = moderationSchema.safeParse(await req.json().catch(() => null));
  if (!slug.success || !COMMENT_ID.test(id) || !change.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const db = adminDb();
  const col = db.collection("petitions").doc(slug.data).collection("comments");
  // Transaction so two admins can't pin past the cap at the same time.
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(col.doc(id));
    if (!snap.exists) return null;
    const pinned = await tx.get(col.where("pinned", "==", true));
    const next = applyModeration(
      { pinned: Boolean(snap.get("pinned")), hidden: Boolean(snap.get("hidden")) },
      change.data,
      pinned.docs.filter((d) => d.id !== id).length,
    );
    if (typeof next !== "string") tx.update(snap.ref, next);
    return next;
  });
  if (result === null) return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  if (typeof result === "string") return NextResponse.json({ error: result }, { status: 409 });
  // Campaign pages cache their first page of comments for a day.
  revalidatePath("/");
  revalidatePath(`/c/${slug.data}`);
  return NextResponse.json({ id, ...result });
}
