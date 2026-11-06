// Seeds the demo campaigns and comments. Usage: npm run seed (reads .env.local).
import { cert, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";
import { seedCampaigns, seedComments } from "../src/data/seed";
import { DEMO_MODE } from "../src/lib/demo";

// Sample signatures and comments must never reach a live database.
if (!DEMO_MODE) throw new Error("Refusing to seed: NEXT_PUBLIC_DEMO_MODE=false (live). Seed only the demo project.");

const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, PETITION_ID = "default" } = process.env;
if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
  throw new Error("Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY");
}

initializeApp({
  credential: cert({
    projectId: FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();

const ts = (iso: string | null) => (iso === null ? null : Timestamp.fromDate(new Date(iso)));

async function main() {
  const batch = db.batch();
  for (const { slug, startAt, endAt, goalReachedAt, deletedAt, createdAt, updatedAt, signatureCount, ...rest } of seedCampaigns()) {
    const id = slug === "default" ? PETITION_ID : slug;
    const ref = db.collection("petitions").doc(id);
    const doc = { ...rest, startAt: ts(startAt), endAt: ts(endAt), goalReachedAt: ts(goalReachedAt), deletedAt: null, createdAt: ts(createdAt), updatedAt: ts(updatedAt) };
    // Existing docs gain the campaign fields but keep their real signature count; new ones are created whole.
    if ((await ref.get()).exists) batch.set(ref, doc, { merge: true });
    else batch.create(ref, { ...doc, signatureCount, deletedAt: ts(deletedAt) });
    console.log(`petitions/${id}`);
  }

  const petition = db.collection("petitions").doc(PETITION_ID);
  if ((await petition.collection("comments").limit(1).get()).empty) {
    for (const c of seedComments()) {
      batch.set(petition.collection("comments").doc(), { ...c, createdAt: Timestamp.fromDate(new Date(c.createdAt)) });
    }
  }
  await batch.commit();
  console.log("Seeded");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
