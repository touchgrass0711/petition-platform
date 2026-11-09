import { getPetition } from "@/lib/petition";
import { ogCard, ogSize } from "@/lib/og-card";

export const revalidate = 86400;
export const size = ogSize;
export const contentType = "image/png";
export const alt = "Petition";

export default async function OgImage() {
  const { title, signatureCount, goal } = await getPetition();
  return ogCard(title, { count: signatureCount, goal });
}
