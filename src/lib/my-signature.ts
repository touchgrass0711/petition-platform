"use client";

import { ANONYMOUS_NAME } from "@/lib/schemas";
import type { Comment } from "@/lib/types";

/** The signed-in signer's Firebase ID token (live mode). */
export async function liveIdToken() {
  const auth = (await import("@/lib/firebase/client")).clientAuth();
  await auth.authStateReady(); // after a reload the session is restored asynchronously
  return auth.currentUser?.getIdToken() ?? null;
}

async function call<T>(method: string, campaign: string, body?: object): Promise<T> {
  const token = await liveIdToken();
  const query = method === "PATCH" ? "" : `?campaign=${encodeURIComponent(campaign)}`;
  const res = await fetch(`/api/comments/mine${query}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify({ ...body, campaign }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

/** Live mode: the signer's own signature, edited or deleted by the server after an ownership check. */
export const mySignature = {
  get: (campaign: string) => call<{ comment: Comment }>("GET", campaign).then((d) => d.comment),
  edit: (campaign: string, c: Comment) =>
    call("PATCH", campaign, {
      name: c.name === ANONYMOUS_NAME ? "" : c.name,
      message: c.message,
      anonymous: c.name === ANONYMOUS_NAME,
      avatarUrl: c.avatarUrl,
      avatarPreset: c.avatarPreset ?? null,
    }),
  remove: (campaign: string) => call("DELETE", campaign),
};
