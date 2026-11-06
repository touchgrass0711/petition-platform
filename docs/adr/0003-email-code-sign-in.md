# ADR 0003: Email-code sign-in before signing, Demo Mode first

- Status: Accepted (Demo Mode built; live mode built behind the switch, off)
- Updated: 2026-11-02 (Brevo first, ordered fallback)
- Date: 2026-11-01

## Context

Anyone can sign as often as the rate limit allows, so the signature count can be inflated. Signers should prove they own an inbox before signing, one signature per person. Firebase email-link sign-in sends only 5 emails a day on the free Spark plan and sends links, not codes, so it does not fit.

## Decision

1. **Custom 6-digit email code.** `POST /api/auth/code` validates the email (Zod), checks Turnstile and rate limits (per IP 5/10 min, per email 3/15 min and 5/day), then issues a code. Only `HMAC-SHA256(OTP_HMAC_SECRET, email:code)` is stored, in Upstash under `otp:{sha256(email)}`, for 10 minutes. `POST /api/auth/verify` allows 5 attempts per code, compares in constant time, and deletes the code on success (single use).
2. **Demo Mode (`NEXT_PUBLIC_DEMO_MODE` not `false`):** no email is sent and no account is created. The code is returned to the browser and shown in a notice labelled "Demo Mode". A successful verify sets a session-only flag in `sessionStorage`; signing and the "already signed" state stay in that tab session. No Firestore writes.
3. **Live mode** (off until `NEXT_PUBLIC_DEMO_MODE=false`) adds:
   - verify returns a Firebase custom token (`signInWithCustomToken`) with a `signer: true` claim; write APIs and `storage.rules` require that claim, so accounts from Firebase's own sign-up can't sign (keep Firebase sign-up disabled anyway),
   - signer uid = `e_` + `HMAC-SHA256(SIGNER_ID_SECRET, email)`, so the public avatar path can't be matched to a guessed email; the secret must never rotate after launch,
   - one signature per account via a private `signers/{uid}` doc created in the same Firestore transaction as the comment and counter,
   - real Turnstile keys and avatar upload lockdown (security review H1, H3).
4. **Email delivery** goes through one `sendEmail()` (`src/lib/server/email.ts`) over each provider's HTTP API, in order: **Brevo** (300/day free) → **Resend** (100/day) → **Mailjet** (200/day, optional), about 600 codes a day on free plans. A provider is used only if its key is set. Each has a daily counter in Upstash (`mail:{provider}:{UTC date}`, 48 h TTL) and is skipped at 95% of its cap. `429` marks it spent for the day; `5xx`, auth and network errors move to the next provider at once; `400`/`422` (bad address) stop, since every provider would refuse it. The code is issued once before sending, so failover never changes it. HTTP APIs, not SMTP: same quotas, no extra dependency, faster cold starts on Vercel.
5. Signers choose **Send as Anonymous** (checked by default); the public comment then stores only "Anonymous".

## Consequences

- The demo runs the real validation, Turnstile, rate-limit and code-checking path; only delivery and persistence are skipped.
- Without Upstash credentials (local dev, CI) codes live in process memory, which does not work across serverless instances. Public deployments must set Upstash.
- Switching to live mode needs the follow-up PRs plus `OTP_HMAC_SECRET`, `SIGNER_ID_SECRET` and email-provider env vars; the screens and API shape stay the same.
