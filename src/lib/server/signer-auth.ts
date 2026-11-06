import "server-only";
import { createHmac } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { adminDb } from "@/lib/firebase/admin";
import { isGooglePhoto } from "@/lib/tiny-avatar";

// Keyed, so a public avatar path (avatars/{uid}/…) can't be matched to a guessed email. Never rotate after launch:
// a new secret gives every signer a new uid, so they could sign again.
export function uidFor(email: string): string {
  const secret = process.env.SIGNER_ID_SECRET;
  if (!secret) throw new Error("SIGNER_ID_SECRET is not set");
  return `e_${createHmac("sha256", secret).update(email).digest("hex")}`;
}

const auth = () => {
  adminDb(); // ensures the Admin app is initialised
  return getAuth();
};

/** Live mode: minted after a correct email code; the browser exchanges it with signInWithCustomToken. */
/** Live mode: minted after a correct email code or Google sign-in; `photo` is the Google profile photo, if any. */
export const customTokenFor = (email: string, photo?: string | null) =>
  auth().createCustomToken(uidFor(email), { signer: true, ...(photo && isGooglePhoto(photo) && { photo }) });

/**
 * Live mode: checks a Firebase ID token from the Google provider. verifyIdToken checks the signature, audience
 * (this Firebase project), issuer and expiry; we add the provider and a verified email. Never trusts client claims.
 */
export async function verifyGoogleToken(idToken: string): Promise<{ email: string; uid: string; photo: string | null } | null> {
  try {
    const d = await auth().verifyIdToken(idToken);
    if (d.firebase?.sign_in_provider !== "google.com" || d.email_verified !== true || !d.email) return null;
    // Lower-cased like emailSchema, so Google and the email code give the same signer uid.
    return { email: d.email.toLowerCase(), uid: d.uid, photo: typeof d.picture === "string" && isGooglePhoto(d.picture) ? d.picture : null };
  } catch {
    return null;
  }
}

/** The Google user Firebase created on the way in; the signer continues as uidFor(email), so it holds nothing we need. */
export const deleteAuthUser = (uid: string) => auth().deleteUser(uid);

/** The signer from `Authorization: Bearer <idToken>`, or null. Only tokens minted by customTokenFor count. */
export async function signerClaims(req: Request): Promise<{ uid: string; photo: string | null } | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  try {
    const decoded = await auth().verifyIdToken(token);
    // Accounts from Firebase sign-up (email/password, anonymous) have no claim, so they can't skip the email code.
    return decoded.signer === true ? { uid: decoded.uid, photo: typeof decoded.photo === "string" ? decoded.photo : null } : null;
  } catch {
    return null;
  }
}

export const signerUid = async (req: Request) => (await signerClaims(req))?.uid ?? null;

/** Live mode: an https avatar must be the signer's own Google photo (from their token); inline images are checked by the schema. */
export const ownAvatar = (avatarUrl: string | null, photo: string | null) => !avatarUrl?.startsWith("https:") || avatarUrl === photo;
