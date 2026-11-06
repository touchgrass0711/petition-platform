import { Timestamp } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { campaignInputSchema } from "@/lib/campaign-schema";
import { DEMO_DISABLED_MESSAGE, DEMO_MODE } from "@/lib/demo";
import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { singleModeSlug, toCampaign } from "@/lib/petition";
import { guard, isAdmin } from "@/lib/server/admin-auth";
import { inputToDoc } from "@/lib/server/campaign-store";
import { seedCampaigns } from "@/data/seed";

/** Every campaign, drafts and deleted included, newest start first. */
export async function GET(req: Request) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // shortcut: reads the whole collection; fine for tens of campaigns, paginate past a few hundred.
  const campaigns = isFirebaseAdminConfigured
    ? (await adminDb().collection("petitions").get()).docs.map((d) => toCampaign(d.id, d.data()))
    : seedCampaigns();
  campaigns.sort((a, b) => b.startAt.localeCompare(a.startAt));
  const single = await singleModeSlug();
  return NextResponse.json({ campaigns: single ? campaigns.filter((c) => c.slug === single) : campaigns }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const denied = await guard(req, "create");
  if (denied) return denied;
  if (DEMO_MODE) return NextResponse.json({ error: DEMO_DISABLED_MESSAGE }, { status: 403 });
  const parsed = campaignInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid campaign", issues: parsed.error.flatten().fieldErrors }, { status: 400 });

  const now = Timestamp.now();
  const ref = adminDb().collection("petitions").doc(parsed.data.slug);
  try {
    // create() fails if the slug exists, including soft-deleted campaigns, so a slug is never reused.
    await ref.create({
      ...inputToDoc(parsed.data),
      featured: false,
      signatureCount: 0,
      goalReachedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  } catch (e) {
    if ((e as { code?: number }).code === 6) return NextResponse.json({ error: "That slug is already taken." }, { status: 409 });
    throw e;
  }
  revalidatePath("/");
  return NextResponse.json({ slug: parsed.data.slug }, { status: 201 });
}
