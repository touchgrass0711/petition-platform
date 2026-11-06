# ADR 0001: Demo Mode and 24-hour edge caching

- Status: Accepted
- Date: 2026-10-29

## Context

The public deployment is a portfolio piece. It has to feel fully functional to anyone who opens it, but it runs on free or low tiers of Firebase and Vercel. An open sign form would fill the database with test data and spam, and every page view that reaches Firestore costs a read.

## Decision

1. **Demo Mode is on by default.** `NEXT_PUBLIC_DEMO_MODE` must be exactly `false` to allow writes, so a missing or mistyped variable fails safe.
2. **Writes are intercepted on the server, not hidden in the UI.** `POST /api/comments` runs rate limiting, validation and Turnstile as in production, then returns the comment without writing. Admin write endpoints return `403`. The client adds the new comment from React state.
3. **Reads are cached for 24 hours.** The petition page and OG image use `revalidate = 86400`, and the comments API sends `s-maxage=86400, stale-while-revalidate=3600`.
4. **Without Firebase credentials the app serves seed data from memory**, so clones, previews and CI need no secrets.

## Consequences

- Firestore sees roughly one read batch per day per cached URL, and zero writes.
- The demo exercises the real validation and security path, so it shows how the live system behaves.
- New comments and counts take up to 24 hours to appear for other visitors. That is fine for a demo; a live campaign can lower `revalidate`. Admin changes call `revalidatePath("/")` to refresh the page immediately.
- Turning Demo Mode off is one environment variable, with no code changes.
