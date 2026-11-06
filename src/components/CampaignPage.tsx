import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PetitionBody } from "@/components/PetitionBody";
import { PhaseBadge } from "@/components/PhaseBadge";
import { RichText } from "@/components/RichText";
import { ShareButtons } from "@/components/ShareButtons";
import { SiteHeader } from "@/components/SiteHeader";
import { campaignPhase } from "@/lib/campaign";
import { slugSchema } from "@/lib/campaign-schema";
import { getCampaign, getComments } from "@/lib/petition";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Drafts, deleted campaigns and malformed slugs are all a plain 404, without a Firestore read for junk.
export async function visibleCampaign(slug: string) {
  if (!slugSchema.safeParse(slug).success) return null;
  const campaign = await getCampaign(slug);
  return campaign && campaignPhase(campaign) !== "draft" ? campaign : null;
}

export async function campaignMetadata(slug: string, path: string): Promise<Metadata> {
  const c = await visibleCampaign(slug);
  if (!c) return {};
  const description = c.subtitle || c.descriptionText.slice(0, 200);
  return {
    title: c.title,
    description,
    openGraph: { title: c.title, description, type: "website", url: path },
    twitter: { card: "summary_large_image", title: c.title, description },
  };
}

export async function CampaignPage({ slug, path }: { slug: string; path: string }) {
  const campaign = await visibleCampaign(slug);
  if (!campaign) notFound();
  const firstPage = await getComments(null, slug);
  const url = new URL(path, siteUrl).toString();
  const renderedAt = Date.now();
  return (
    <>
      <SiteHeader />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklch,var(--foreground)_12%,transparent),transparent)]"
      />
      <main className="mx-auto max-w-5xl px-4 pt-16 pb-12">
        <section className="mx-auto max-w-2xl animate-fade-up text-center">
          <PhaseBadge campaign={campaign} renderedAt={renderedAt} />
          <h1 className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-4xl font-bold tracking-tight text-balance text-transparent sm:text-6xl">
            {campaign.title}
          </h1>
          {campaign.subtitle && <p className="mt-5 text-lg text-pretty text-muted-foreground">{campaign.subtitle}</p>}
          <div className="mt-8 flex justify-center">
            <ShareButtons url={url} text={`Sign: ${campaign.title}`} />
          </div>
        </section>
        <PetitionBody campaign={campaign} initialPage={firstPage} renderedAt={renderedAt} shareUrl={url}>
          <section aria-label="About this campaign">
            <RichText doc={campaign.description} />
          </section>
        </PetitionBody>
      </main>
    </>
  );
}
