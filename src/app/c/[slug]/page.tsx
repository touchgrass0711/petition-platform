import { redirect } from "next/navigation";
import { CampaignPage, campaignMetadata } from "@/components/CampaignPage";
import { getSettings } from "@/lib/server/settings";

// Rendered on first visit, then served from the edge for a day; phase changes flip on the client.
export const revalidate = 86400;
export const generateStaticParams = async () => [];

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return campaignMetadata(slug, `/c/${slug}`);
}

export default async function Page({ params }: Props) {
  if ((await getSettings()).mode === "single") redirect("/"); // no campaign URLs in single-campaign mode
  const { slug } = await params;
  return <CampaignPage slug={slug} path={`/c/${slug}`} />;
}
