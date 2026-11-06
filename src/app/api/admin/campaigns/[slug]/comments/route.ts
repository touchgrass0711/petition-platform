import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { slugSchema } from "@/lib/campaign-schema";
import { commentFilters } from "@/lib/comment-moderation";
import { getAdminComments } from "@/lib/petition";
import { isAdmin } from "@/lib/server/admin-auth";

const query = z.object({
  filter: z.enum(commentFilters).default("all"),
  cursor: z.string().regex(/^(?:[A-Za-z0-9]{20}|seed-\d{1,3})$/).nullable().default(null),
});

/** Moderation list for one campaign, hidden comments included. Reads are allowed in Demo Mode. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slug = slugSchema.safeParse((await params).slug);
  const sp = req.nextUrl.searchParams;
  const q = query.safeParse({ filter: sp.get("filter") ?? undefined, cursor: sp.get("cursor") });
  if (!slug.success || !q.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const page = await getAdminComments(slug.data, q.data.filter, q.data.cursor);
  return NextResponse.json(page, { headers: { "Cache-Control": "no-store" } });
}
