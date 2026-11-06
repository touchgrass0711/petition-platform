import { DEMO_MODE } from "@/lib/demo";

/** Service values the browser needs. Built on the server from env plus Master panel overrides, then passed down as props. */
export type PublicConfig = { turnstileSiteKey: string; posthogKey: string | null; googleSignin: boolean };

export function publicConfig(env: Record<string, string | undefined>, demo = DEMO_MODE): PublicConfig {
  const google = env.NEXT_PUBLIC_GOOGLE_SIGNIN;
  return {
    // Cloudflare's always-pass test key when unset; production must set a real site key.
    turnstileSiteKey: env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA",
    posthogKey: env.NEXT_PUBLIC_POSTHOG_KEY || null,
    // Demo Mode shows a simulated chooser unless switched off; live shows the button only once the
    // Google provider is enabled in Firebase and this is "true".
    googleSignin: google ? google === "true" : demo,
  };
}
