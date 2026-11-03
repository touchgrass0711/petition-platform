import { NextResponse } from "next/server";
import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { DEMO_MODE } from "@/lib/demo";
import { hogql, isPosthogQueryConfigured } from "@/lib/server/posthog";
import { addDays, buildDocs, cronAuthorized, fetchResults, nextChunk, ROLLUP_FIELDS } from "@/lib/server/rollup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIME_BUDGET_MS = 40_000; // stop starting chunks well before maxDuration
const MAX_CHUNKS = 5; // 7 queries each: ≤ 35 PostHog queries per run, under the 120/hour organisation limit
const BATCH = 400; // Firestore allows 500 writes per batch

/**
 * Vercel Cron, once a day. Copies PostHog traffic for each finished UTC day into petitions/{slug}/daily/{day},
 * resuming from meta/rollup.lastDay. The first run backfills up to a year, a few 30-day chunks per run.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (!cronAuthorized(req.headers.get("authorization"), secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (DEMO_MODE) return NextResponse.json({ skipped: "demo" });
  if (!isFirebaseAdminConfigured || !(await isPosthogQueryConfigured())) return NextResponse.json({ skipped: "not configured" });

  const db = adminDb();
  const meta = db.doc("meta/rollup");
  const slugs = new Set((await db.collection("petitions").select().get()).docs.map((d) => d.id));
  let lastDay: string | null = (await meta.get()).get("lastDay") ?? null;
  const started = Date.now();
  let chunks = 0;
  let written = 0;

  for (let span = nextChunk(lastDay, started); span; span = nextChunk(lastDay, started)) {
    if (chunks >= MAX_CHUNKS || Date.now() - started > TIME_BUDGET_MS) break;
    const results = await fetchResults((q) => hogql<unknown[]>(q, { revalidate: false }), span.from, span.to);
    const docs = [...buildDocs(results, slugs)];
    for (let i = 0; i < docs.length; i += BATCH) {
      const batch = db.batch();
      for (const [key, fields] of docs.slice(i, i + BATCH)) {
        const [slug, day] = key.split("/");
        batch.set(db.doc(`petitions/${slug}/daily/${day}`), fields, { mergeFields: [...ROLLUP_FIELDS] });
      }
      await batch.commit();
    }
    written += docs.length;
    lastDay = addDays(span.to, -1);
    // Progress is saved after each chunk's writes, so a timeout or crash resumes without gaps.
    await meta.set({ lastDay, updatedAt: new Date().toISOString() }, { merge: true });
    chunks++;
  }

  return NextResponse.json({ lastDay, chunks, written, caughtUp: nextChunk(lastDay, started) === null });
}
