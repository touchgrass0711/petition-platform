import { onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut, type User } from "firebase/auth";
import { DEMO_ADMIN, DEMO_MODE } from "@/lib/demo";
import { clientAuth, isFirebaseClientConfigured } from "@/lib/firebase/client";

// An unconfigured demo deploy has no Firebase project; the demo credentials still work and the API serves sample data.
const local = !isFirebaseClientConfigured && DEMO_MODE;
const LOCAL_KEY = "demo-admin";

export type Session = { email: string; token: () => Promise<string | null> };

const fromUser = (u: User): Session => ({ email: u.email ?? "", token: () => u.getIdToken() });
const localSession: Session = { email: DEMO_ADMIN.email, token: async () => null };

export async function signIn(email: string, password: string): Promise<void> {
  if (!local) {
    await signInWithEmailAndPassword(clientAuth(), email, password);
    return;
  }
  if (email !== DEMO_ADMIN.email || password !== DEMO_ADMIN.password) throw new Error("Invalid email or password.");
  sessionStorage.setItem(LOCAL_KEY, "1");
  window.dispatchEvent(new Event(LOCAL_KEY));
}

export async function signOut(): Promise<void> {
  if (!local) return fbSignOut(clientAuth());
  sessionStorage.removeItem(LOCAL_KEY);
  window.dispatchEvent(new Event(LOCAL_KEY));
}

export function watchSession(cb: (s: Session | null) => void): () => void {
  if (!local) return onAuthStateChanged(clientAuth(), (u) => cb(u ? fromUser(u) : null));
  const emit = () => cb(sessionStorage.getItem(LOCAL_KEY) ? localSession : null);
  emit();
  window.addEventListener(LOCAL_KEY, emit);
  return () => window.removeEventListener(LOCAL_KEY, emit);
}
