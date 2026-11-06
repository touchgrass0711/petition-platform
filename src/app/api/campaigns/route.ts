import { NextResponse, type NextRequest } from "next/server";
import { slugSchema } from "@/lib/campaign-schema";
import { listCampaigns } from "@/lib/petition";
import { allowCommentRead } from "@/lib/server/ratelimit";

const clientIp = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

export async function GET(req: NextRequest) {
  const after = req.nextUrl.searchParams.get("after");
  if (after !== null && !slugSchema.safeParse(after).success) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }
  if (!(await allowCommentRead(clientIp(req)))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  // Same hourly freshness as the landing page; most visitors are served from the edge cache.
  return NextResponse.json(await listCampaigns(after), {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" },
  });
}
