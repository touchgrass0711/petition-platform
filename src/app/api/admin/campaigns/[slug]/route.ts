import { Timestamp } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { goalReachedAfterEdit } from "@/lib/campaign";
import { campaignInputSchema, slugSchema } from "@/lib/campaign-schema";
import { DEMO_DISABLED_MESSAGE, DEMO_MODE } from "@/lib/demo";
import { adminDb } from "@/lib/firebase/admin";
import { getCampaign, singleModeSlug, toCampaign } from "@/lib/petition";
import { guard, isAdmin } from "@/lib/server/admin-auth";
import type { Capability } from "@/lib/settings";
import { inputToDoc } from "@/lib/server/campaign-store";

type Ctx = { params: Promise<{ slug: string }> };

// Shared gate: admin with the capability, not Demo Mode, valid slug. Returns the slug or the error response.
async function gate(req: Request, ctx: Ctx, cap: Capability): Promise<string | NextResponse> {
  const denied = await guard(req, cap);
  if (denied) return denied;
  if (DEMO_MODE) return NextResponse.json({ error: DEMO_DISABLED_MESSAGE }, { status: 403 });
  const slug = slugSchema.safeParse((await ctx.params).slug);
  return slug.success ? slug.data : NextResponse.json({ error: "Invalid campaign" }, { status: 400 });
}

const done = (slug: string) => {
  revalidatePath("/");
  revalidatePath(`/c/${slug}`);
  return NextResponse.json({ slug });
};
const notFound = () => NextResponse.json({ error: "Campaign not found" }, { status: 404 });

/** One campaign for the edit form, drafts and deleted included. Reads are allowed in Demo Mode. */
export async function GET(req: Request, ctx: Ctx) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slug = slugSchema.safeParse((await ctx.params).slug);
  if (!slug.success) return NextResponse.json({ error: "Invalid campaign" }, { status: 400 });
  const campaign = await getCampaign(slug.data);
  return campaign ? NextResponse.json({ campaign }, { headers: { "Cache-Control": "no-store" } }) : notFound();
}

/** Full edit from the campaign form. The slug is fixed once created. */
export async function PUT(req: Request, ctx: Ctx) {
  const slug = await gate(req, ctx, "edit");
  if (typeof slug !== "string") return slug;
  const single = await singleModeSlug();
  if (single && single !== slug) return NextResponse.json({ error: "Single-campaign mode: only the home page campaign can be edited." }, { status: 403 });
  const parsed = campaignInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid campaign", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  if (parsed.data.slug !== slug) return NextResponse.json({ error: "The slug can't be changed" }, { status: 400 });

  const db = adminDb();
  const ref = db.collection("petitions").doc(slug);
  const found = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const now = Timestamp.now();
    const reached = goalReachedAfterEdit(toCampaign(slug, snap.data()!), parsed.data.goal, now.toDate().toISOString());
    tx.update(ref, {
      ...inputToDoc(parsed.data),
      goalReachedAt: reached === null ? null : Timestamp.fromDate(new Date(reached)),
      updatedAt: now,
    });
    return true;
  });
  return found ? done(slug) : notFound();
}

const flagSchema = z.union([z.object({ featured: z.boolean() }).strict(), z.object({ deleted: z.boolean() }).strict()]);

/** Feature toggle (at most one featured) and soft delete / restore. */
export async function PATCH(req: Request, ctx: Ctx) {
  const parsed = flagSchema.safeParse(await req.json().catch(() => null));
  const slug = await gate(req, ctx, parsed.data && "deleted" in parsed.data ? "delete" : "feature");
  if (typeof slug !== "string") return slug;
  if (!parsed.success) return NextResponse.json({ error: "Invalid change" }, { status: 400 });
  const change = parsed.data;

  const db = adminDb();
  const col = db.collection("petitions");
  const ref = col.doc(slug);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return "missing";
    const now = Timestamp.now();
    if ("deleted" in change) {
      // Soft delete keeps comments and signers; deleted campaigns are never featured.
      tx.update(ref, change.deleted ? { deletedAt: now, featured: false, updatedAt: now } : { deletedAt: null, updatedAt: now });
      return "ok";
    }
    if (change.featured) {
      if (snap.get("deletedAt")) return "deleted";
      const others = await tx.get(col.where("featured", "==", true));
      others.docs.filter((d) => d.id !== slug).forEach((d) => tx.update(d.ref, { featured: false }));
    }
    tx.update(ref, { featured: change.featured, updatedAt: now });
    return "ok";
  });
  if (result === "missing") return notFound();
  if (result === "deleted") return NextResponse.json({ error: "Restore the campaign before featuring it." }, { status: 409 });
  return done(slug);
}
