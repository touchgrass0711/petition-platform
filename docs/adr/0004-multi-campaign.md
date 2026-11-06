# ADR 0004: Many campaigns, admin-only Radix/Tiptap/Recharts, landing page cache

- Status: Accepted
- Date: 2026-11-02
- Supersedes: ADR 0002 decision 2 ("No Radix") for admin-only components

## Context

The app served one petition per deployment (`petitions/{PETITION_ID}`). Admins now need to create and manage many campaigns, each with a rich description, milestones, a signer goal, start and end times and its own time zone, and the public site needs a landing page listing them. Research and the agreed decisions are in `docs/research/campaigns-and-metrics.md`.

## Decision

1. **One `petitions/{slug}` doc per campaign.** The collection, rules and comment index stay; the doc id is the URL slug (`/c/[slug]`). `PETITION_ID` remains the fallback campaign while the change rolls out.
2. **Phase is derived, never stored.** `campaignPhase(campaign, now)` is a pure function of `status`, `startAt` and `endAt` (draft, scheduled, live, ended). "Achieved" is a badge from `goalReachedAt`, not a phase. The signing transaction refuses anything that is not Live, so cached HTML and visitor clocks cannot open signing early or keep it open late.
3. **Times are UTC instants plus an IANA time zone.** The admin enters wall-clock time in the campaign's zone; `@date-fns/tz` converts it.
4. **Rich text is stored as Tiptap JSON, validated on the server and rendered to HTML on the server.** Browser HTML is never stored and the editor never ships in the public bundle.
5. **Radix, `react-day-picker`, Tiptap and Recharts are allowed in admin-only components**, installed as shadcn source via `components.json`. Public pages keep to the existing primitives plus `pagination`.
6. **Caching:** `/c/[slug]` keeps `revalidate = 86400` and flips phase on the client; `/` uses `revalidate = 3600` so ordering catches up within an hour. Admin saves call `revalidatePath` for both.
7. **Delete is soft** (`deletedAt`): the slug stays reserved and comments and signers are kept.

## Consequences

- No data migration: the existing doc keeps working and gains fields as the admin edits it.
- The admin bundle grows (Radix, editor, charts); the public bundle barely changes.
- `/` costs about 15 reads per hourly regeneration, well inside the free tier.
- Firestore needs a composite index `status + deletedAt + startAt desc` for the landing list.
