# ADR 0007: Master-only integration settings

- Status: Accepted
- Date: 2026-11-03

## Context

The owner wants service parameters (Turnstile, PostHog, email providers, Google sign-in) editable in the admin panel, by the Master account only, at no cost (no Blaze, Secret Manager or KMS).

## Decision

1. **Master = developer claim AND `MASTER_EMAIL`.** `caller(req).master` needs both. `MASTER_EMAIL` is env-only; unset means nobody is Master. A stolen developer claim on another account is not enough, and the allowlist can't be edited from the app.
2. **Overrides live in one server-only doc, `config/integrations`**, keyed by the env var name they override (`INTEGRATIONS` in `src/lib/server/integrations.ts`). Precedence: panel → env → unset. Only the listed keys are read; Firebase, Upstash, `SIGNER_ID_SECRET`, `OTP_HMAC_SECRET`, `ADMIN_EMAILS`, `CRON_SECRET` and build flags stay env-only.
3. **Secrets are sealed with AES-256-GCM** (`node:crypto`, `{ v, iv, tag, ct }`) under `SETTINGS_ENCRYPTION_KEY` (env-only, 32 bytes). Without the key, secret writes are refused and stored secrets are ignored, so env values keep working. A secret that fails to decrypt falls back to env.
4. **Only ciphertext is cached.** `unstable_cache` holds the raw doc; decryption runs per call, so plain secrets never reach the Next data cache.
5. **Every set or clear writes `config/integrations/audit/{id}`** = `{ at, by, field, action }` in the same batch, never the value.

## Consequences

- Losing `SETTINGS_ENCRYPTION_KEY` means re-entering panel secrets; the app falls back to env meanwhile.
- Pages cached for 24 h bake in public values, so saving one must revalidate those pages (wired with the public values).
- `/api/admin/integrations` (GET status, PUT one field) is a 404 for anyone but Master, refuses writes in Demo Mode and when the sign-in is older than 10 minutes, and never returns secret values.
- Server code reads service keys through `serverEnv()` (process.env with panel overrides): Turnstile, PostHog query, email, health. Without Firebase it is plain process.env.
- Public values (Turnstile site key, PostHog key, Google on/off) are resolved in the root layout by `publicConfig(await serverEnv())` and passed to the client through `Providers` (`usePublicConfig()`); saving one revalidates every page. PostHog hosts stay build-time because they are in the CSP.
