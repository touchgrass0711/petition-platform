import { describe, expect, it } from "vitest";
import { publicConfig } from "./public-config";

describe("publicConfig", () => {
  it("falls back to the Turnstile test key and no PostHog", () => {
    expect(publicConfig({}, false)).toEqual({ turnstileSiteKey: "1x00000000000000000000AA", posthogKey: null, googleSignin: false });
  });
  it("Google sign-in follows the flag, else Demo Mode", () => {
    expect(publicConfig({}, true).googleSignin).toBe(true);
    expect(publicConfig({ NEXT_PUBLIC_GOOGLE_SIGNIN: "false" }, true).googleSignin).toBe(false);
    expect(publicConfig({ NEXT_PUBLIC_GOOGLE_SIGNIN: "true" }, false).googleSignin).toBe(true);
  });
  it("passes set values through", () => {
    const c = publicConfig({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0xreal", NEXT_PUBLIC_POSTHOG_KEY: "phc_x" }, false);
    expect([c.turnstileSiteKey, c.posthogKey]).toEqual(["0xreal", "phc_x"]);
  });
});
