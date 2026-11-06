import "server-only";
import type { DocumentData, DocumentSnapshot, Timestamp } from "firebase-admin/firestore";
import { seedCampaigns, seedComments, seedPetition } from "@/data/seed";
import { campaignPhase, type Campaign, type CampaignSummary, type RichTextNode } from "@/lib/campaign";
import { adminDb, isFirebaseAdminConfigured, petitionId } from "@/lib/firebase/admin";
import type { CommentFilter } from "@/lib/comment-moderation";
import type { Comment, Petition } from "@/lib/types";
import { getSettings } from "@/lib/server/settings";

export const PAGE_SIZE = 10;

export type CommentPage = { comments: Comment[]; nextCursor: string | null };

// Without Firebase credentials (local dev, CI, forks) the app serves the seed data.
const fallbackComments: Comment[] = seedComments().map((c, i) => ({ ...c, id: `seed-${i}` }));

function toComment(doc: DocumentSnapshot): Comment {
  const d = doc.data()!;
  return {
    id: doc.id,
    name: d.name,
    message: d.message,
    avatarUrl: d.avatarUrl ?? null,
    avatarPreset: d.avatarPreset ?? null,
    pinned: Boolean(d.pinned),
    hidden: Boolean(d.hidden),
    createdAt: d.createdAt.toDate().toISOString(),
  };
}

const fallbackCampaigns = seedCampaigns();

const iso = (t: Timestamp | null | undefined) => t?.toDate().toISOString() ?? null;
// Docs written before campaigns existed have a plain-text description and no dates.
const legacyDoc = (text: string): RichTextNode => ({
  type: "doc",
  content: text ? [{ type: "paragraph", content: [{ type: "text", text }] }] : [],
});

export function toCampaign(slug: string, d: DocumentData): Campaign {
  const description = typeof d.description === "string" ? legacyDoc(d.description) : d.description;
  const created = iso(d.createdAt) ?? new Date(0).toISOString();
  return {
    slug,
    title: d.title ?? "",
    subtitle: d.subtitle ?? "",
    description: description ?? legacyDoc(""),
    descriptionText: d.descriptionText ?? (typeof d.description === "string" ? d.description : ""),
    goal: d.goal ?? 1,
    milestones: d.milestones ?? [],
    startAt: iso(d.startAt) ?? created,
    endAt: iso(d.endAt),
    timeZone: d.timeZone ?? "UTC",
    status: d.status ?? "published",
    featured: Boolean(d.featured),
    signatureCount: d.signatureCount ?? 0,
    goalReachedAt: iso(d.goalReachedAt),
    deletedAt: iso(d.deletedAt),
    createdAt: created,
    updatedAt: iso(d.updatedAt) ?? created,
  };
}

/** Any stored campaign, including drafts and deleted ones; callers decide visibility with `campaignPhase`. */
export async function getCampaign(slug: string): Promise<Campaign | null> {
  if (!isFirebaseAdminConfigured) {
    const id = slug === petitionId() ? "default" : slug;
    const c = fallbackCampaigns.find((c) => c.slug === id);
    return c ? { ...c, slug } : null;
  }
  const doc = await adminDb().collection("petitions").doc(slug).get();
  return doc.exists ? toCampaign(slug, doc.data()!) : null;
}

export const CAMPAIGN_PAGE_SIZE = 12;
export type CampaignPage = { campaigns: CampaignSummary[]; nextCursor: string | null };

// List payloads skip the rich description; cards only need the plain-text excerpt.
function summary(c: Campaign): CampaignSummary {
  const s: Partial<Campaign> = { ...c, descriptionText: c.descriptionText.slice(0, 240) };
  delete s.description;
  return s as CampaignSummary;
}

// shortcut: reads the whole collection and filters in memory, so no composite index or field backfill is needed
// and pre-campaign docs still show. Fine for tens of campaigns (hourly ISR); switch to an indexed query past a few hundred.
async function visibleCampaigns(): Promise<Campaign[]> {
  const all = isFirebaseAdminConfigured
    ? (await adminDb().collection("petitions").get()).docs.map((d) => toCampaign(d.id, d.data()))
    : fallbackCampaigns;
  return all.filter((c) => campaignPhase(c) !== "draft").sort((a, b) => b.startAt.localeCompare(a.startAt));
}

/** Public campaigns, newest start first. The cursor is the last slug of the previous page. */
export async function listCampaigns(after: string | null = null): Promise<CampaignPage> {
  const all = await visibleCampaigns();
  const start = after ? all.findIndex((c) => c.slug === after) + 1 : 0;
  const page = all.slice(start, start + CAMPAIGN_PAGE_SIZE);
  return { campaigns: page.map(summary), nextCursor: start + CAMPAIGN_PAGE_SIZE < all.length ? page.at(-1)!.slug : null };
}

/** The featured campaign (at most one is flagged) and the newest one that is live right now. */
export async function getHighlights(now = Date.now()): Promise<{ featured: Campaign | null; newestLive: Campaign | null }> {
  const all = await visibleCampaigns();
  return {
    featured: all.find((c) => c.featured) ?? null,
    newestLive: all.find((c) => campaignPhase(c, now) === "live") ?? null,
  };
}

/** Single-campaign mode shows this one: the featured campaign, else the newest live one, else the newest public one. */
export async function getSingleCampaign(now = Date.now()): Promise<Campaign | null> {
  const all = await visibleCampaigns();
  return all.find((c) => c.featured) ?? all.find((c) => campaignPhase(c, now) === "live") ?? all[0] ?? null;
}

/** The campaign `/` shows when the developer picked single-campaign mode, else null (landing page). */
export async function singleModeSlug(): Promise<string | null> {
  if ((await getSettings()).mode !== "single") return null;
  return (await getSingleCampaign())?.slug ?? null;
}

export async function getPetition(): Promise<Petition> {
  if (!isFirebaseAdminConfigured) return { id: petitionId(), ...seedPetition };
  const doc = await adminDb().collection("petitions").doc(petitionId()).get();
  return { id: doc.id, ...seedPetition, ...doc.data() } as Petition;
}

export async function getComments(cursor: string | null = null, slug = petitionId()): Promise<CommentPage> {
  const page = await commentPage(cursor, slug);
  // shortcut: a hidden comment leaves its page one short; filter in the query if pages get sparse.
  return { ...page, comments: page.comments.filter((c) => !c.hidden) };
}

// One page in public order (pinned first, newest first), hidden comments included.
async function commentPage(cursor: string | null, slug: string): Promise<CommentPage> {
  if (!isFirebaseAdminConfigured) {
    // Only the default campaign has seed comments.
    if (slug !== petitionId()) return { comments: [], nextCursor: null };
    const start = cursor ? fallbackComments.findIndex((c) => c.id === cursor) + 1 : 0;
    const comments = fallbackComments.slice(start, start + PAGE_SIZE);
    const more = start + PAGE_SIZE < fallbackComments.length;
    return { comments, nextCursor: more ? comments.at(-1)!.id : null };
  }

  const col = adminDb().collection("petitions").doc(slug).collection("comments");
  let query = col.orderBy("pinned", "desc").orderBy("createdAt", "desc").limit(PAGE_SIZE + 1);
  if (cursor) {
    const last = await col.doc(cursor).get();
    if (last.exists) query = query.startAfter(last);
  }
  const docs = (await query.get()).docs;
  const comments = docs.slice(0, PAGE_SIZE).map(toComment);
  return { comments, nextCursor: docs.length > PAGE_SIZE ? comments.at(-1)!.id : null };
}

const FLAG_LIMIT = 100;

/** Admin moderation list: everything (paged), or the pinned / hidden comments of one campaign. */
export async function getAdminComments(slug: string, filter: CommentFilter, cursor: string | null = null): Promise<CommentPage> {
  if (filter === "all") return commentPage(cursor, slug);
  if (!isFirebaseAdminConfigured) {
    const comments = slug === petitionId() ? fallbackComments.filter((c) => Boolean(c[filter])) : [];
    return { comments, nextCursor: null };
  }
  // shortcut: equality-only query (no composite index), newest first in memory, capped at FLAG_LIMIT.
  const snap = await adminDb().collection("petitions").doc(slug).collection("comments").where(filter, "==", true).limit(FLAG_LIMIT).get();
  const comments = snap.docs.map(toComment).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { comments, nextCursor: null };
}
