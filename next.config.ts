import type { NextConfig } from "next";

// Report-only until a clean week of reports, then set CSP_ENFORCE=true at build time; the static 24h-cached page cannot carry per-request nonces,
// so scripts keep 'unsafe-inline' for Next.js's inline bootstrap.
// Google sign-in (live): Firebase loads gapi from apis.google.com and frames its auth handler on the authDomain.
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://*.posthog.com https://apis.google.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "font-src 'self'",
  "connect-src 'self' https://*.posthog.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
  `frame-src https://challenges.cloudflare.com${authDomain ? ` https://${authDomain}` : ""}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const enforceCsp = process.env.CSP_ENFORCE === "true";

const securityHeaders = [
  // Always enforced: these cannot break the page and stop clickjacking of the Sign button.
  enforceCsp
    ? { key: "Content-Security-Policy", value: csp }
    : { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
  ...(enforceCsp ? [] : [{ key: "Content-Security-Policy-Report-Only", value: csp }]),
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
