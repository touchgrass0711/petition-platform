"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { DEMO_GOOGLE_ACCOUNTS, DEMO_MODE } from "@/lib/demo";
import { SignerAvatar } from "./SignerAvatar";

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="size-5">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Live mode: Google popup, then the server swaps the Google ID token for the signer token the email code gives. */
async function liveGoogleSignIn(): Promise<{ email: string; photo: string | null } | null> {
  const [{ GoogleAuthProvider, signInWithCustomToken, signInWithPopup }, { clientAuth }] = await Promise.all([
    import("firebase/auth"),
    import("@/lib/firebase/client"),
  ]);
  const auth = clientAuth();
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    if ((e as { code?: string }).code === "auth/popup-closed-by-user") return null;
    throw new Error("Google sign-in failed. Try again or use your email.");
  }
  const res = await fetch("/api/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: await auth.currentUser!.getIdToken() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    await auth.signOut();
    throw new Error(data.error ?? "Something went wrong.");
  }
  await signInWithCustomToken(auth, data.token);
  return { email: data.email, photo: data.photo ?? null };
}

/** "Continue with Google". Demo Mode: a simulated account chooser; nothing is sent to Google or Firebase. */
export function GoogleSignIn({ onSignedIn }: { onSignedIn: (email: string, photo: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function live() {
    track("sign_started", { method: "google" });
    setBusy(true);
    setError(null);
    try {
      const account = await liveGoogleSignIn();
      if (account) pick(account.email, account.photo);
    } catch (e) {
      setError(e instanceof TypeError ? "Network error. Please try again." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const pick = (email: string, photo: string | null) => {
    track("code_verified", { method: "google" });
    onSignedIn(email, photo);
  };

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        disabled={busy}
        {...(DEMO_MODE && { "aria-expanded": open, "aria-controls": "google-chooser" })}
        onClick={() => {
          if (!DEMO_MODE) return void live();
          if (!open) track("sign_started", { method: "google" });
          setOpen(!open);
        }}
      >
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <GoogleMark />} Continue with Google
      </Button>
      {error && <p role="alert" className="text-center text-sm text-destructive">{error}</p>}
      {open && (
        <div id="google-chooser" role="group" aria-labelledby="google-chooser-title" className="rounded-lg border bg-muted/30 p-3">
          <p id="google-chooser-title" className="text-sm font-medium">Choose an account</p>
          <p className="mb-2 text-xs text-muted-foreground">Demo Mode: simulated Google sign-in. Nothing is sent to Google.</p>
          <ul className="space-y-1">
            {DEMO_GOOGLE_ACCOUNTS.map((a) => (
              <li key={a.email}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-md p-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  onClick={() => pick(a.email, a.photo)}
                >
                  <SignerAvatar name={a.name} avatarUrl={a.photo} />
                  <span className="min-w-0">
                    <span className="block font-medium">{a.name}</span>
                    <span className="block truncate text-muted-foreground">{a.email}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
