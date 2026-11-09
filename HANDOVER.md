# Handover guide

This guide is for the owner taking over the live petition site at **https://petition-platform-lime.vercel.app** and this repository. It lists the accounts to take over, the configuration the site needs, how to deploy and roll back, and what is still to be checked.

## 1. What you receive

- This repository (Next.js 15 app, tests, Firestore rules and indexes).
- The live deployment on Vercel, running in live mode (real sign-ins, real signatures).
- The Firebase project holding the database and admin accounts.
- The supporting services below, already configured.

## 2. Accounts to take over

For each service: add your own account as owner/admin first, confirm you can sign in, then decide whether the developer stays as a member. Turn on 2FA everywhere and keep credentials in a password manager.

| Service | Used for | How to take over |
| --- | --- | --- |
| GitHub | Source code, CI (GitHub Actions) | Settings → General → Transfer ownership to your account or organisation, or add yourself as admin. Vercel must be reconnected to the new owner after a transfer (Vercel project → Settings → Git). |
| Vercel | Hosting, cron, environment variables | Invite yourself to the team as Owner (Team → Members), or transfer the project to your team (Project → Settings → Transfer). Use a **Pro** plan: Hobby is for non-commercial use only. |
| Firebase | Firestore database, admin sign-in | Firebase console → Project settings → Users and permissions → add yourself as **Owner**. Billing stays on the free Spark plan; no Cloud Storage is used. |
| Upstash | Redis for rate limits | Add yourself to the team, or create your own database and replace the two `UPSTASH_*` values. |
| Brevo | Sending sign-in codes by email | Use your own Brevo account with a verified sender domain, then replace `BREVO_API_KEY` and `EMAIL_FROM`. Free tier: 300 emails a day. |
| Cloudflare Turnstile | Bot check on signing | Create a widget for your domain in your Cloudflare account and replace both Turnstile keys. |
| PostHog | Cookieless traffic analytics | Invite yourself to the organisation as Owner, or create your own project and replace the `POSTHOG_*` values. |
| Domain and DNS | Custom domain (optional) | Register the domain in your name; point it at Vercel through Cloudflare DNS with SSL/TLS **Full (strict)**. Then update `NEXT_PUBLIC_SITE_URL`. |

## 3. Admin access

- `/admin` signs in with Firebase Auth email and password.
- **Admin**: any email listed in `ADMIN_EMAILS`, or any account with the `developer` claim.
- **Master** (can edit service integrations in the admin panel): an account with the `developer` claim **and** whose email equals `MASTER_EMAIL`.
- **The developer keeps the Master account** so they can make changes you request. `MASTER_EMAIL` is set to the developer's email.

Add your own admin:

1. Firebase console → Authentication → Add user (your email and a strong password).
2. Add your email to `ADMIN_EMAILS` in Vercel (comma-separated) and redeploy.

Optional, to become Master yourself:

1. With the Firebase admin values in `.env.local`, run `npm run developer -- you@yourdomain.com`. It creates or resets the account, sets the `developer` claim and prints a one-time password.
2. Set `MASTER_EMAIL` to your email in Vercel and redeploy. Only one email can be Master.

Optional, to remove the developer's access later: changing `MASTER_EMAIL` alone is not enough, because the `developer` claim still makes that account an admin. Also disable or delete the developer's user in Firebase Authentication, and remove the developer from each service in section 2.

## 4. Environment variables

`.env.example` is the reference list, with comments. Set values in Vercel → Project → Settings → Environment Variables (Production), then redeploy.

| Group | Variables | Notes |
| --- | --- | --- |
| Mode | `NEXT_PUBLIC_DEMO_MODE`, `PETITION_ID`, `NEXT_PUBLIC_SITE_URL` | Demo Mode must be `false` on the live site. Site URL drives share links and Open Graph tags. |
| Firebase (public) | `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase console → Project settings → Your apps. |
| Firebase (server) | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Project settings → Service accounts → Generate new private key. |
| Turnstile | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare → Turnstile. |
| Upstash | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Upstash console → database → REST API. |
| Admin | `ADMIN_EMAILS`, `MASTER_EMAIL`, `SETTINGS_ENCRYPTION_KEY` | See section 3. The encryption key protects service keys saved in the admin panel. |
| PostHog | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `POSTHOG_HOST`, `POSTHOG_PROJECT_ID`, `POSTHOG_PERSONAL_API_KEY` | Project key for tracking; personal API key (read access) for the dashboard. |
| Cron | `CRON_SECRET` | `openssl rand -hex 32`. Vercel Cron calls `/api/cron/rollup` daily at 00:30 UTC. |
| Sign-in codes | `OTP_HMAC_SECRET`, `SIGNER_ID_SECRET`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `BREVO_API_KEY` | Fallback senders: `RESEND_API_KEY`, `MAILJET_API_KEY` + `MAILJET_SECRET_KEY`, `GMAIL_USER` + `GMAIL_APP_PASSWORD`. |
| Privacy notice | `PRIVACY_CONTROLLER_NAME`, `PRIVACY_CONTACT_EMAIL` | Shown on `/privacy`. |
| Optional | `NEXT_PUBLIC_GOOGLE_SIGNIN`, `NEXT_PUBLIC_AVATAR_UPLOADS`, `CSP_ENFORCE` | See comments in `.env.example`. |

Values saved by the Master in the admin panel (Turnstile, PostHog, email senders) override the Vercel values. When you replace a key, update it in both places or clear the panel value.

## 5. Rotate keys after takeover

Rotate every secret the developer has seen, one service at a time: create the new key, update Vercel (and the admin panel if set there), redeploy, check the site, then revoke the old key.

Rotate: `FIREBASE_PRIVATE_KEY` (new service account key, then delete the old one), `TURNSTILE_SECRET_KEY`, `UPSTASH_REDIS_REST_TOKEN`, `BREVO_API_KEY`, `POSTHOG_PERSONAL_API_KEY`, `CRON_SECRET`, `OTP_HMAC_SECRET`.

Do **not** rotate casually:

- `SIGNER_ID_SECRET`: it keys signer IDs. Changing it lets everyone who already signed sign again.
- `SETTINGS_ENCRYPTION_KEY`: values saved in the admin panel become unreadable. Re-enter them right after changing it.

## 6. Runbook

**Deploy.** Work goes into `dev` through pull requests; Vercel builds a preview for each. Merging `dev` into `master` deploys production. GitHub Actions runs lint, typecheck, tests and a build on every pull request.

**Roll back.** Vercel → Project → Deployments → pick the last good production deployment → Instant Rollback. Then revert the bad commit on `master` so the next deploy does not bring it back.

**Firestore rules and indexes.** After changing `firestore.rules` or `firestore.indexes.json`: `firebase deploy --only firestore:rules,firestore:indexes`.

**Run locally.** `npm install`, copy `.env.example` to `.env.local`, fill it in, `npm run dev`. Checks: `npm run lint && npm run typecheck && npm test`.

## 7. Still to do before launch

- [ ] Create the first campaign in `/admin` (the seed script only runs in Demo Mode).
- [ ] Send a real sign-in code by email and confirm it arrives (Brevo sending not yet tested end to end).
- [ ] Sign once with a real Turnstile check on a phone and a desktop.
- [ ] Confirm a pageview appears in PostHog and the daily rollup ran (Vercel → Logs, `/api/cron/rollup`).

## 8. Known gaps

- The privacy notice says signatures and comments are deleted up to 12 months after a petition closes; no job does this yet. Until one is built, delete them by hand or build the purge job.
- No guided first-run setup screens.
- No payments or monetisation.
