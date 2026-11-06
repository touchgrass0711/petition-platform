// Creates or resets a developer account with a fresh random password and the `developer` custom claim.
// Usage: npm run developer -- you@example.com   (reads .env.local; prints the password once, store it in a password manager)
import { randomBytes } from "node:crypto";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
  throw new Error("Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY");
}
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Usage: npm run developer -- you@example.com");

initializeApp({
  credential: cert({ projectId: FIREBASE_PROJECT_ID, clientEmail: FIREBASE_CLIENT_EMAIL, privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") }),
});
const auth = getAuth();

async function main() {
  const password = randomBytes(18).toString("base64url"); // 24 chars, 144 bits
  const existing = await auth.getUserByEmail(email!).catch((e) => (e.code === "auth/user-not-found" ? null : Promise.reject(e)));
  const user = existing
    ? await auth.updateUser(existing.uid, { password, emailVerified: true, disabled: false })
    : await auth.createUser({ email, password, emailVerified: true });
  await auth.setCustomUserClaims(user.uid, { ...user.customClaims, developer: true });
  await auth.revokeRefreshTokens(user.uid); // old sessions sign in again with the new password
  console.log(`${existing ? "Reset" : "Created"} developer ${email}\nPassword: ${password}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
