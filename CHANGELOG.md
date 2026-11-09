# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Security

- Public pages no longer show a link to the admin area; it stays reachable by URL only.

## [0.2.0-alpha.1] - 2026-11-09

### Security
- Patched vulnerable dependencies (postcss, grpc-js, minimatch, glob via overrides; vitest 4).

### Changed
- Brand name in the footer and privacy notice default is now OUTSET.ID.

## [0.1.0-alpha.2] - 2026-11-05

### Changed

- `npm run seed` refuses to run when `NEXT_PUBLIC_DEMO_MODE=false`, so sample signatures and comments never land in a live database.
- The Turnstile site key, PostHog project key and Google sign-in switch come from the server per render (Master panel value, else env) instead of being fixed at build time; saving one refreshes cached pages.
- Turnstile verification, the PostHog query (metrics rollup), email sending and the email quota on the health card now use values saved in the Master Integrations panel, falling back to Vercel env.
- Avatars are a 64 px WebP stored inline on the signature (checked server-side: real WebP/PNG/JPEG bytes, 8 KB max) instead of Firebase Storage uploads, so live mode needs no Storage bucket or Blaze plan; `storage.rules` is gone.

### Added

- Privacy notice at `/privacy` (data collected, public display, delivery to recipients, processors, retention, rights, 13+, browser storage), linked from the footer, with a consent line above the sign button. PostHog now keeps its state in memory, so it sets no analytics cookies. The notice names who runs the petition, every processor, retention per data type, the right to withdraw consent and how Do Not Track is handled; name and contact come from `PRIVACY_CONTROLLER_NAME` and `PRIVACY_CONTACT_EMAIL` (falling back to `GMAIL_USER`).
- Integrations section on the Master settings page: see where each service value comes from (panel, Vercel env, not set), save or clear an override, see which env-only values are set, and the last 20 changes. Secrets are write-only; the API is a 404 for anyone but Master, writes need a sign-in from the last 10 minutes, and Demo Mode is read-only. Saved values take effect once the services are wired to them.
- Signer menu → Change avatar: pick the Google photo, an uploaded image, initials, or one of six colours. Removing an upload never silently falls back to the Google photo. Google sign-in uses the Google photo by default (live mode carries it in the signer token, and the server only accepts that exact photo URL). `NEXT_PUBLIC_AVATAR_UPLOADS=false` hides image uploads.
- Groundwork for Master-only service settings (ADR 0007): `MASTER_EMAIL` pins the Master account (developer claim and that email; unset means nobody), service keys saved in the panel are encrypted with AES-256-GCM using `SETTINGS_ENCRYPTION_KEY` and refused when it is missing, panel values override env, and every change is audited without its value. No panel yet.
- Signer menu under the signer's avatar on the sign card (like YouTube's account menu): edit my signature (name or Anonymous, comment), delete my signature (with confirmation; the count goes down and they can sign again), sign out. Demo Mode keeps changes in the page; live mode (still off) edits and deletes through `/api/comments/mine`, which finds the signature only through the signer's verified uid, applies the signing rules, rate-limits, and removes the comment, signer record and one from the count in one transaction.
- Share images show progress: "8,452 of 10,000 signed", a bar, and the next milestone (or "Goal reached: 108%").
- After signing, the prefilled share text quotes the signer's own reason ("I signed … because …", capped at 140 characters), and the thank-you card names the next milestone to reach.
- One line under the progress bar with the three newest signers' avatars and "Latest: name, time ago", from comments already on the page (no extra reads). Hidden once the campaign ends.
- `sitemap.xml` (home and public campaigns, or home only in single-campaign mode), `robots.txt` (admin and API disallowed), canonical URLs and schema.org data on campaign pages.
- Share links carry `utm_source` (button), `utm_medium=share` and `utm_campaign` (slug); the dashboard shows "Visits from shares" by channel. The nightly rollup now runs 7 queries per chunk and at most 5 chunks per run.
- "Continue with Google" for signers, above the email code. Demo Mode shows a simulated account chooser that writes nothing; signing in again as someone who already signed in this tab shows "You have already signed this petition." `NEXT_PUBLIC_GOOGLE_SIGNIN` switches it (default: on in Demo Mode, off in live).
- Live mode (still off): Google sign-in swaps a server-verified Google ID token (audience, expiry, provider, verified email) for the same signer uid as the email code, so one signature per person holds across both (ADR 0006).
- Live mode (still off): email codes can be sent from a Gmail account over SMTP (`GMAIL_USER`, `GMAIL_APP_PASSWORD`), tried after Brevo, Resend and Mailjet, for deploys without their own domain.

## [0.1.0-alpha.1] - 2026-11-03

### Security

- The Master account is invisible to other admins: /admin/developer is a 404 for everyone else (signed out included), the settings API only reports the role to the Master account itself, and switched-off actions say "Not available for this account." without naming it.
- Firestore rules hide draft and soft-deleted campaigns from client reads; `signers/` and `daily/` stay server-only.
- Signing is refused (403) outside a campaign's Live window, for drafts, deleted and unknown campaigns, checked inside the signing transaction on the server clock; Demo Mode answers follow the same window. The signature that reaches the goal records `goalReachedAt` once, signing stays open past the goal, and each signature adds to a per-day, per-hour rollup.
- Live mode (still off): only accounts from email-code sign-in can sign or upload avatars (custom `signer` claim), signer uids are keyed with `SIGNER_ID_SECRET` so avatar paths don't reveal emails, sign-in codes are capped at 5 per email per day, and avatars must be WebP, PNG or JPEG.
- Live mode (still off): signing requires a Firebase ID token from email-code sign-in, one signature per account via a `signers/{uid}` doc in the same transaction, Turnstile refuses missing or test secret keys, avatar uploads require sign-in into the signer's own folder, and `CSP_ENFORCE=true` switches the full CSP from report-only to enforced.
- Security headers on every response (clickjacking block, nosniff, referrer and permissions policy), a report-only CSP, and no `x-powered-by`; the comments API rejects malformed cursors and rate-limits paginated reads.

### Changed

- Single-campaign mode is now the default (alpha): with no saved settings, `/` is the featured campaign, and the admin metrics only show that campaign. The seeded featured campaign is past its goal (8,452 of 8,000) so the demo shows the Achieved badge and every milestone.
- The developer role is shown as "Master" in the admin panel: a Master badge in the top bar, a Master item in the menu, and Master settings at /admin/developer.
- Admin campaigns list: the "New campaign" button sits next to the list filters instead of in the top bar.
- ADR 0004: many campaigns per deployment, derived campaign phases, and Radix, Tiptap and Recharts allowed in admin-only components; `components.json` for the shadcn CLI and chart colour tokens.
- Theme moved to shadcn/ui neutral design tokens with Geist font; dark theme is the default, with a light/dark toggle.
- Petition page redesigned: sticky blurred header, gradient hero, progress card, two-column layout with a sticky sign form, and a dark OG image.
- Admin redesigned on a TailAdmin-style layout: sidebar, sticky header, metric cards, source bars and a comments table; login moved into a card.
- Runtime moved to Node 24 (engines, `.nvmrc`, CI) to match `@firebase/auth` requirements.
- Install-script policy (`allowScripts`) for npm 12 and a `rimraf` override that drops deprecated `glob@10` from the install.

### Added

- Each campaign page has its own share image (title and signature count) for WhatsApp, X and other link previews, instead of the default campaign's image. Drafts and unknown campaigns get a neutral image.
- Comment moderation per campaign on each campaign's edit page: All / Pinned / Hidden filters, at most 3 pinned comments per campaign (checked in a transaction), and hide / show, where hidden comments stay stored but leave the public list. Pinning or hiding refreshes that campaign's page at once. The default-campaign comment table on the dashboard is removed.
- Signers without a photo get a coloured initials avatar drawn locally (same colour for the same name), replacing the grey icon.
- Single-campaign mode (developer setting): `/` shows the featured campaign (else the newest live one), `/c/<slug>` redirects home, and the admin list and edit form are limited to that campaign.
- Developer settings at /admin/developer (developer accounts only): switch each admin capability (create, edit, feature, delete, pin comments, goal, metrics, health) on or off for other admins, and choose single-campaign or multiple-campaign mode. Enforced on every admin API route; stored in the server-only `config/settings` doc. ADR 0005.
- Developer role: accounts with the `developer` custom claim are admins without being in `ADMIN_EMAILS`. `npm run developer -- <email>` creates or resets one with a random password and signs out its old sessions.
- Admin dashboard Health card: rate-limit blocks, Turnstile failures and honeypot hits counted per day in Upstash (last 7 days vs the 7 before), and today's sign-in emails against each provider's free daily cap. Sample numbers in Demo Mode. The unused `/api/admin/stats` route is removed.
- Admin metrics dashboard, part 2: visitors and sessions chart with bounce rate and average session tiles, the signing funnel with step conversion, referrer, country, device and share-channel breakdowns, and a campaign comparison table in the All campaigns view. The old 7-day traffic cards are replaced.
- Admin metrics dashboard, part 1: campaign and range filters kept in the URL, KPI tiles with deltas against the previous period (arrow and text, not colour alone), a signatures chart with the previous period dashed and a cumulative mode with milestone and goal lines, a pace card, a table view, and a "Sample data" badge. Chart colours checked for colour-blind separation in light and dark.
- Metrics API at /api/admin/metrics (campaign or All campaigns, any range): signatures, traffic, funnel, breakdowns, pace and a campaign comparison from the daily rollups, cached 10 minutes. Demo Mode serves deterministic sample rollups that end at each campaign's real count.
- Nightly rollup at /api/cron/rollup (Vercel Cron, 00:30 UTC): copies PostHog page views, visitors, sessions, bounces, session time, funnel steps and the top referrers, countries, devices and share channels into each campaign's daily docs. Requires CRON_SECRET, is idempotent, never touches signature counts, and backfills up to a year a few chunks per run.
- Dashboard range model: 24h, 3D, 7D, 30D, 3M, 6M, 1Y and All with buckets in the campaign time zone (weeks from Monday), a previous period of equal length, and deltas that leave out the partial current bucket.
- Analytics events for the dashboard funnel: sign_started, code_sent, code_verified, signed and share_clicked (whatsapp, x, copy, native), each with the campaign slug and no personal data; nothing is sent when PostHog is not configured.
- Confirm dialogs: publishing a draft, moving the start of a live campaign (says whether signing closes until then), and deleting a campaign, which needs its link typed in; in Demo Mode the dialogs work and the final button shows the Demo Mode message.
- Campaign form: Tiptap rich text description (headings, emphasis, lists, quotes, safe links only) with a preview rendered by the public renderer, and milestone rows with add, remove and Generate up to goal; the editor loads only in the admin form.
- Campaign form (new and edit): title with auto link, subtitle, goal, time zone picker from the browser's zone list, start and end date and time read in that zone, Today and Indefinitely, draft or published; validated with the same schema as the API, and stopped with the Demo Mode message after validation.
- Admin Campaigns page: every campaign with phase, Achieved and Featured badges, signatures against goal and start time in its zone; feature, delete and restore (Deleted filter); admin pages share one sign-in gate and get a section menu on mobile.
- Admin campaign API: list all campaigns (drafts and deleted included), create (slug reserved forever), full edit with `goalReachedAt` following goal changes, feature toggle keeping one featured campaign, soft delete and restore; every write is 403 in Demo Mode and revalidates `/` and the campaign page.
- Landing page `/` lists campaigns: featured, newest live, then every public campaign newest first with pagination (`/api/campaigns`, edge-cached for an hour); regenerated hourly.
- Campaign page at `/c/[slug]`: rich description rendered on the server, phase badge with countdown and campaign time zone, Achieved badge, closed state with the sign form replaced, progress past 100% and milestone ticks; drafts and deleted campaigns are 404. `/` shows the default campaign the same way for now.
- Campaign model: Zod schema with a StarterKit-only rich text check (safe links, size and depth caps), derived phases (draft, scheduled, live, ended), wall-clock ↔ UTC conversion per IANA time zone, a suggested milestone ladder, and five seed campaigns covering every state.
- Hold to sign: the Sign button is now a press-and-hold "Leaving Thumbprint" button whose thumbprint fills in while held (mouse, touch, or holding Space/Enter); releasing early cancels, and reduced-motion users get a stepped fill.
- Live-mode email delivery for sign-in codes with ordered free-provider fallback (Brevo → Resend → Mailjet), per-provider daily counters in Upstash and instant failover on 429/5xx. Off while Demo Mode is on.
- Email + 6-digit code sign-in before signing (ADR 0003). In Demo Mode no email is sent and the code is shown on screen.
- "Send as Anonymous" (checked by default), honeypot and spam checks on comments, and a share card (OS share sheet, WhatsApp, X, copy link for Discord) that replaces the form after signing.
- Site-wide copyright footer ("© 2026 DAWN. All rights reserved.").
