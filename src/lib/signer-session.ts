"use client";

import { useSyncExternalStore } from "react";
import { DEMO_MODE } from "@/lib/demo";

// Signer UI state for this tab. In live mode the Firebase Auth session (custom token) is what the API trusts.
// `signed` lists campaign slugs signed in this tab, so another campaign still shows its form.
export type Signer = { email: string; signed: string[]; photo?: string | null }; // photo: Google profile photo

const KEY = "signer";
// email -> signed slugs, kept across sign-outs so signing in again as the same person shows "already signed".
const HISTORY = "signer-history";
const EVENT = "signer-change";

function read(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function write(value: Signer | null) {
  try {
    if (value) sessionStorage.setItem(KEY, JSON.stringify(value));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked (private mode): the session just won't survive a reload.
  }
  window.dispatchEvent(new Event(EVENT));
}

function history(): Record<string, string[]> {
  try {
    return JSON.parse(sessionStorage.getItem(HISTORY) ?? "{}");
  } catch {
    return {};
  }
}

function remember(email: string, signed: string[]) {
  try {
    sessionStorage.setItem(HISTORY, JSON.stringify({ ...history(), [email]: signed }));
  } catch {
    // Storage blocked: same as above.
  }
}

/** Restores what this person already signed in this tab, so a second signature is refused in the UI too. */
export const signIn = (email: string, photo: string | null = null) => write({ email, photo, signed: history()[email] ?? [] });

export function markSigned(signer: Signer, slug: string) {
  const signed = [...signer.signed, slug];
  remember(signer.email, signed);
  write({ ...signer, signed });
}

/** After deleting a signature: this person may sign that campaign again. */
export function unmarkSigned(signer: Signer, slug: string) {
  const signed = signer.signed.filter((s) => s !== slug);
  remember(signer.email, signed);
  write({ ...signer, signed });
}

export const readSigner = (): Signer | null => JSON.parse(read() ?? "null");

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export function useSigner() {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const parsed: Signer | null = raw ? JSON.parse(raw) : null;
  const signer = parsed && { ...parsed, signed: Array.isArray(parsed.signed) ? parsed.signed : [] };
  return {
    signer,
    signIn,
    markSigned: (slug: string) => signer && markSigned(signer, slug),
    unmarkSigned: (slug: string) => signer && unmarkSigned(signer, slug),
    signOut: () => {
      write(null);
      if (!DEMO_MODE) void import("@/lib/firebase/client").then(({ clientAuth }) => clientAuth().signOut());
    },
  };
}
