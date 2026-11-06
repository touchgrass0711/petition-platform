import type { Metadata } from "next";
import { CampaignCard } from "@/components/CampaignCard";
import { CampaignList } from "@/components/CampaignList";
import { CampaignPage, campaignMetadata } from "@/components/CampaignPage";
import { SiteHeader } from "@/components/SiteHeader";
import { getHighlights, listCampaigns, singleModeSlug } from "@/lib/petition";

// Hourly, so "newest live" and the list order catch up without a redeploy (~15 reads per regeneration).
export const revalidate = 3600;

const landing: Metadata = {
  title: "Campaigns",
  description: "Open campaigns: read, sign and share.",
  openGraph: { title: "Campaigns", description: "Open campaigns: read, sign and share.", type: "website", url: "/" },
};

// Single-campaign mode (developer setting): `/` is that campaign and there is no landing page.
export async function generateMetadata(): Promise<Metadata> {
  const slug = await singleModeSlug();
  return slug ? campaignMetadata(slug, "/") : landing;
}

export default async function Home() {
  const slug = await singleModeSlug();
  if (slug) return <CampaignPage slug={slug} path="/" />;
  const renderedAt = Date.now();
  const [{ featured, newestLive }, firstPage] = await Promise.all([getHighlights(renderedAt), listCampaigns()]);
  const highlights = [
    featured && { label: "Featured", campaign: featured },
    newestLive && newestLive.slug !== featured?.slug && { label: "Newest", campaign: newestLive },
  ].filter((h) => !!h);
  return (
    <>
      <SiteHeader />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklch,var(--foreground)_12%,transparent),transparent)]"
      />
      <main className="mx-auto max-w-5xl px-4 pt-16 pb-12">
        <section className="mx-auto max-w-2xl animate-fade-up text-center">
          <h1 className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text text-4xl font-bold tracking-tight text-balance text-transparent sm:text-6xl">
            Campaigns
          </h1>
          <p className="mt-5 text-lg text-pretty text-muted-foreground">Read what each campaign asks for, add your name, and share it.</p>
        </section>
        {highlights.length > 0 && (
          <div className={`mt-14 grid animate-fade-up gap-6 [animation-delay:150ms] ${highlights.length > 1 ? "lg:grid-cols-2" : ""}`}>
            {highlights.map(({ label, campaign }) => (
              <section key={label} aria-label={label} className="relative">
                <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
                <CampaignCard campaign={campaign} renderedAt={renderedAt} large />
              </section>
            ))}
          </div>
        )}
        <CampaignList initialPage={firstPage} renderedAt={renderedAt} />
      </main>
    </>
  );
}
