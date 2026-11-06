# ADR 0005: Developer role and developer settings

- Status: Accepted
- Date: 2026-11-03

## Context

The owner needs an account above ordinary admins that can switch admin capabilities on and off and choose between running one campaign or many, without a redeploy.

## Decision

1. **Developer = Firebase custom claim `developer: true`.** Set only with the Admin SDK (`npm run developer -- <email>`), so open email sign-up can't grant it. A developer is always an admin.
2. **Settings live in one server-only Firestore doc, `config/settings`** (`{ mode, disabled }`, validated by `settingsSchema`). There is no Firestore rule for `config/`, so clients can't read or write it. Reads go through `unstable_cache` tagged `settings`; a save revalidates the tag, `/` and `/c/[slug]`. A missing or malformed doc means defaults: multiple campaigns, everything on.
3. **Every admin write and read route calls `guard(req, capability)`.** It returns 401 for non-admins and 403 when `blocked(settings, cap, developer)` says no. The UI hides the same controls through `useAdminSettings`, but the server is the enforcement point.
4. **Mode binds everyone; switches don't bind developers.** Single-campaign mode removes create, feature and delete for all admins. A developer can't lock themselves out.
5. **Developers can save settings in Demo Mode.** It is a single config doc and only a claimed developer can write it; the public demo account can't.

## Consequences

- One extra cached Firestore read per admin request after a save.
- Adding a capability is one entry in `CAPABILITIES` plus a `guard` call in its route.
