import "server-only";
import { serverEnv } from "./integrations";

export async function isPosthogQueryConfigured(): Promise<boolean> {
  const env = await serverEnv();
  return Boolean(env.POSTHOG_PERSONAL_API_KEY && env.POSTHOG_PROJECT_ID);
}

/** One HogQL query. `revalidate: false` skips the Next.js data cache (cron jobs need fresh results). */
export async function hogql<T>(query: string, { revalidate = 3600 }: { revalidate?: number | false } = {}): Promise<T[]> {
  const env = await serverEnv();
  const host = env.POSTHOG_HOST ?? "https://us.posthog.com";
  const res = await fetch(`${host}/api/projects/${env.POSTHOG_PROJECT_ID}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    ...(revalidate === false ? { cache: "no-store" as const } : { next: { revalidate } }),
  });
  if (!res.ok) throw new Error(`PostHog query failed: ${res.status}`);
  return (await res.json()).results;
}
