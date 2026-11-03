import type { MetadataRoute } from "next";
import { singleModeSlug, visibleCampaigns } from "@/lib/petition";

export const revalidate = 3600;

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** `/` plus every public campaign; single-campaign mode has no /c/ URLs (they redirect to `/`). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const home = { url: new URL("/", site).toString() };
  if (await singleModeSlug()) return [home];
  const campaigns = await visibleCampaigns();
  return [home, ...campaigns.map((c) => ({ url: new URL(`/c/${c.slug}`, site).toString(), lastModified: c.updatedAt }))];
}
