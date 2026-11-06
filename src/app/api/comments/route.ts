import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";
import { canSign, reachesGoal } from "@/lib/campaign";
import { slugSchema } from "@/lib/campaign-schema";
import { DEMO_MODE } from "@/lib/demo";
import { adminDb, petitionId } from "@/lib/firebase/admin";
import { getCampaign, getComments, toCampaign } from "@/lib/petition";
import { commentRequestSchema } from "@/lib/schemas";
import { allowComment, allowCommentRead } from "@/lib/server/ratelimit";
import { ownAvatar, signerClaims } from "@/lib/server/signer-auth";
import { countMetric } from "@/lib/server/health";
import { verifyTurnstile } from "@/lib/server/turnstile";
import { AVATAR_UPLOADS } from "@/lib/tiny-avatar";
import type { Comment } from "@/lib/types";

// Firestore auto-IDs, or the in-memory seed IDs used without Firebase credentials.
const CURSOR = /^(?:[A-Za-z0-9]{20}|seed-\d{1,3})$/;

const CLOSED = "This campaign is not open for signatures.";

const clientIp = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

export async function GET(req: NextRequest) {
  const cursor = req.nextUrl.searchParams.get("cursor");
  if (cursor !== null && !CURSOR.test(cursor)) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }
  const campaign = slugSchema.safeParse(req.nextUrl.searchParams.get("campaign") ?? petitionId());
  if (!campaign.success) return NextResponse.json({ error: "Invalid campaign" }, { status: 400 });
  if (!(await allowCommentRead(clientIp(req)))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const page = await getComments(cursor, campaign.data);
  // Cached at the edge for 24h so pagination costs no Firestore reads for most visitors.
  return NextResponse.json(page, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" },
  });
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!(await allowComment(ip))) {
    return NextResponse.json({ error: "Too many comments. Try again in a minute." }, { status: 429 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = commentRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { turnstileToken, website, ...input } = parsed.data;
  const slug = slugSchema.safeParse(raw?.campaign ?? petitionId());
  if (!slug.success) return NextResponse.json({ error: "Invalid campaign" }, { status: 400 });

  if (!(await verifyTurnstile(turnstileToken, ip))) {
    return NextResponse.json({ error: "Verification failed" }, { status: 403 });
  }

  const createdAt = new Date();
  const comment: Omit<Comment, "id"> = { ...input, pinned: false, createdAt: createdAt.toISOString() };

  // Honeypot filled: answer like a success so the bot learns nothing, and write nothing.
  // Demo Mode: behave exactly like a successful write, but never write to Firestore.
  // Both still follow the real signing window; live mode checks it inside the transaction instead.
  if (website) countMetric("honeypot");
  if (website || DEMO_MODE) {
    const campaign = await getCampaign(slug.data);
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    if (!canSign(campaign)) return NextResponse.json({ error: CLOSED }, { status: 403 });
    return NextResponse.json({ comment: { id: `demo-${crypto.randomUUID()}`, ...comment }, demo: true }, { status: 201 });
  }

  // Live mode: one signature per signed-in email. The uid comes from a verified Firebase ID token.
  const signerAuth = await signerClaims(req);
  if (!signerAuth) return NextResponse.json({ error: "Sign in with your email first." }, { status: 401 });
  const { uid } = signerAuth;
  if (!ownAvatar(comment.avatarUrl, signerAuth.photo) || (comment.avatarUrl?.startsWith("data:") && !AVATAR_UPLOADS)) return NextResponse.json({ error: "Invalid avatar" }, { status: 400 });
  const db = adminDb();
  const petition = db.collection("petitions").doc(slug.data);
  const ref = petition.collection("comments").doc();
  // Private, rules-denied doc keyed by uid: created in the same transaction, so a second signature can't slip in.
  const signer = petition.collection("signers").doc(uid);
  const iso = createdAt.toISOString();
  // UTC day doc with per-hour counts for the dashboard (one extra write per signature).
  const daily = petition.collection("daily").doc(iso.slice(0, 10));
  const result = await db.runTransaction(async (tx) => {
    // Re-read inside the transaction: the window and goal are decided on this server's clock, at commit time.
    const [snap, signed] = await Promise.all([tx.get(petition), tx.get(signer)]);
    if (!snap.exists) return "missing";
    const current = toCampaign(slug.data, snap.data()!);
    if (!canSign(current, Date.now())) return "closed";
    if (signed.exists) return "duplicate";
    const at = Timestamp.fromDate(createdAt);
    tx.create(signer, { commentId: ref.id, createdAt: at });
    tx.set(ref, { ...comment, createdAt: at });
    // Retried on contention with fresh reads, so goalReachedAt is set exactly once.
    tx.update(petition, { signatureCount: FieldValue.increment(1), ...(reachesGoal(current) && { goalReachedAt: at }) });
    tx.set(daily, { sig: FieldValue.increment(1), sigH: { [iso.slice(11, 13)]: FieldValue.increment(1) } }, { merge: true });
    return "signed";
  });
  if (result === "missing") return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (result === "closed") return NextResponse.json({ error: CLOSED }, { status: 403 });
  if (result === "duplicate") return NextResponse.json({ error: "You have already signed this petition." }, { status: 409 });
  return NextResponse.json({ comment: { id: ref.id, ...comment }, demo: false }, { status: 201 });
}
