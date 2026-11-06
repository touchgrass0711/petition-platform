import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { campaignPhase, isIanaZone } from "@/lib/campaign";
import { slugSchema } from "@/lib/campaign-schema";
import { seedCampaigns } from "@/data/seed";
import { DEMO_MODE } from "@/lib/demo";
import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { parseRange, type DailyDoc } from "@/lib/metrics/range";
import { sampleDocs } from "@/lib/metrics/sample";
import { summarize } from "@/lib/metrics/summary";
import { singleModeSlug, toCampaign } from "@/lib/petition";
import { guard } from "@/lib/server/admin-auth";

// shortcut: reads a campaign's whole daily/ history (≈1 read per active day), cached 10 min and shared by every range.
// Fine for tens of campaigns; add the monthly summary docs from the research plan if reads approach the free tier.
const dailyDocs = unstable_cache(
  async (slug: string): Promise<DailyDoc[]> =>
    (await adminDb().collection("petitions").doc(slug).collection("daily").get()).docs.map((d) => ({ date: d.id, ...d.data() })),
  ["metrics-daily"],
  { revalidate: 600 },
);

/** Dashboard data for one campaign or all of them, over one range. Read-only, so it also works in Demo Mode. */
export async function GET(req: Request) {
  const denied = await guard(req, "metrics");
  if (denied) return denied;
  const params = new URL(req.url).searchParams;
  const range = parseRange(params.get("range"));
  const single = await singleModeSlug(); // single-campaign mode: only that campaign, whatever was asked
  const pick = single ?? params.get("campaign") ?? "all";
  if (pick !== "all" && !slugSchema.safeParse(pick).success) return NextResponse.json({ error: "Invalid campaign" }, { status: 400 });

  const live = isFirebaseAdminConfigured;
  const now = Date.now();
  const stored = live ? (await adminDb().collection("petitions").get()).docs.map((d) => toCampaign(d.id, d.data())) : seedCampaigns();
  const campaigns = stored.filter((c) => campaignPhase(c, now) !== "draft" && (!single || c.slug === single));
  const selected = pick === "all" ? null : (campaigns.find((c) => c.slug === pick) ?? null);
  if (pick !== "all" && !selected) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const sample = DEMO_MODE || !live;
  const docs = new Map(
    await Promise.all(campaigns.map(async (c) => [c.slug, sample ? sampleDocs(c, now) : await dailyDocs(c.slug)] as const)),
  );
  const zone = params.get("tz") ?? "";
  const timeZone = selected?.timeZone ?? (isIanaZone(zone) ? zone : "UTC");
  const summary = summarize({ campaigns, docs, selected: selected?.slug ?? null, range, now, timeZone });

  return NextResponse.json(
    { ...summary, sample, campaigns: campaigns.map((c) => ({ slug: c.slug, title: c.title })) },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
