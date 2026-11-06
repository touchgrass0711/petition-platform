import posthog from "posthog-js";

export type FunnelEvent = "sign_started" | "code_sent" | "code_verified" | "signed" | "share_clicked";

/** Campaign slug from a /c/{slug} path; campaigns are only rendered there. */
export const campaignFromPath = (path: string) => /^\/c\/([a-z0-9-]+)/.exec(path)?.[1] ?? null;

/** Funnel and share events for the dashboard. No personal data: only the campaign slug and, for shares, the channel. */
export function track(event: FunnelEvent, props: Record<string, string> = {}) {
  if (!posthog.__loaded) return; // no key configured, or not initialised yet
  posthog.capture(event, { campaign: campaignFromPath(location.pathname), ...props });
}
