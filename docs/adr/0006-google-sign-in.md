# ADR 0006: Google sign-in for signers

- Status: Accepted (Demo Mode built; live mode built behind `NEXT_PUBLIC_GOOGLE_SIGNIN`, off)
- Date: 2026-11-03

## Context

A deploy on `*.vercel.app` has no domain for SPF/DKIM, so email codes are hard to deliver (research: verification without a domain, option B). Google has already verified its users' email addresses and costs nothing per sign-in. Admin login stays email/password.

## Decision

1. **"Continue with Google" above the email code**, which stays as the fallback. `NEXT_PUBLIC_GOOGLE_SIGNIN`: unset = on in Demo Mode, off in live mode; `"true"` / `"false"` force it.
2. **Demo Mode:** a simulated account chooser in the browser (sample `example.com` accounts). No request to Google, Firebase or our API at sign-in; signing then uses the existing demo path. A per-tab `signer-history` lets a repeat sign-in show "You have already signed this petition."
3. **Live mode — token exchange, not a second identity.** The browser signs in with Firebase's Google provider (`signInWithPopup`) and posts the Firebase ID token to `POST /api/auth/google`. The server:
   - verifies it with `firebase-admin` `verifyIdToken` (signature, audience = this Firebase project, issuer, expiry),
   - requires `firebase.sign_in_provider === "google.com"`, `email_verified === true` and an email,
   - returns `customTokenFor(email)`: the same `e_<HMAC(SIGNER_ID_SECRET, email)>` uid and `signer` claim as the email code,
   - deletes the throwaway Google user Firebase created (best effort), so Firebase Auth keeps no signer profiles.
   The browser then calls `signInWithCustomToken`. Everything after that (signing API, `signers/{uid}` transaction, Turnstile, rate limits) is unchanged.
4. Rate limit: the verify limiter (10 per IP per 10 min). The route answers 404 in Demo Mode or when the flag is off.

## Consequences

- One signature per person holds across both methods: the same email by Google or by code gives the same uid.
- The full CSP allows `https://apis.google.com` scripts and the Firebase auth domain in `frame-src`.
- Go-live needs the Firebase console steps in the README (enable Google provider, authorized domains).
