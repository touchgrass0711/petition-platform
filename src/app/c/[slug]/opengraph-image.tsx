import { visibleCampaign } from "@/components/CampaignPage";
import { ogCard, ogSize } from "@/lib/og-card";

// Same daily cache as the campaign page it belongs to.
export const revalidate = 86400;
export const size = ogSize;
export const contentType = "image/png";
export const alt = "Petition";

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  // Drafts and unknown slugs get a neutral card, so the image never reveals an unpublished title.
  const campaign = await visibleCampaign((await params).slug);
  return campaign ? ogCard(campaign.title, campaign.signatureCount) : ogCard("Petition", null);
}
