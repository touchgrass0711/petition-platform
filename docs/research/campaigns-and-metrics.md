# Campaigns and dashboard metrics — research

Date: 2026-11-02 · Status: research, decisions agreed, nothing built yet · Base: `dev`

Two features for the admin panel:

1. **Create and manage campaigns**: title, subtitle, rich description, milestones, signer goal, start and end date/time (or "Indefinitely"), per-campaign time zone.
2. **Dashboard metrics**: gain or loss over a chosen period (24h … all time) against the previous equal period.

## 0. Decisions (2026-11-02)

| # | Question | Decision |
|---|---|---|
| 1 | Several live campaigns? What does `/` show? | Yes, any number live at once. `/` is a landing page: **featured** campaign, **newest live** campaign, then a **list of all campaigns** sorted by start date, newest first, paginated. |
| 2 | Milestones | Signature thresholds such as 50, 75, 125, 200, 300 …, set in the admin panel, each ≤ the signer goal. |
| 3 | Description format | Rich text editor with full formatting (headings, bold/italic, lists, links, quotes). |
| 4 | Time zone, times | Per-campaign time zone; default = the logged-in admin's time zone. Start and end have a date **and** time. |
| 5 | Scheduled campaigns | Visible before start ("Opens in 3 days"), but nobody can sign until the start time. |
| 6 | Goal reached / after the end | Reaching the goal shows an **Achieved** badge but signing stays open until the end date, counting past 100%. After the end the page stays up, dimmed, signing disabled, badged **Achieved** if the goal was reached, otherwise **Closed**. |
| 7 | Editing a live campaign | Allowed. Changing the start date of a live campaign, and deleting a campaign, each need an extra confirmation step in a modal. |
| 8 | Ranges and "All" for traffic | Presets in §3.2. Traffic is copied once a day from PostHog into Firestore rollups, so "All" works for traffic and signatures without depending on PostHog retention (§3.3). |

## 1. Where the code is today

| Area | Today | Gap |
|---|---|---|
| Data model | One `petitions/{PETITION_ID}` doc (`title`, `description`, `goal`, `signatureCount`) with `comments/` and private `signers/` subcollections. | No subtitle, milestones, dates, time zone, status. One campaign per deployment. |
| Admin writes | `PATCH /api/admin/petition` (goal only), comment pin. 403 in Demo Mode, then `revalidatePath("/")`. | No campaign create/list/edit/delete. |
| Public page | `/` renders the one petition, `revalidate = 86400`. | No landing page, no per-campaign route, no open/closed states. |
| Signing | `POST /api/comments`: comment + signer doc + `signatureCount++` in one transaction. | Never checks whether the campaign is open. |
| Metrics | `getStats()`: 2 HogQL queries (7-day views, visitors, top referrers), cached 1 h. | No time series, ranges, comparison or charts. |
| PostHog | Default `posthog.init` (auto page views), no custom events. | No funnel, share clicks or conversion. |
| UI kit | Hand-copied shadcn Button, Card, Input, Label, Badge. No Radix, no `components.json` (ADR 0002). | Needs Field, Calendar, Popover, Checkbox, Combobox, Alert Dialog, Dialog, ToggleGroup, Select, Chart, Pagination. |

## 2. Campaigns

### 2.1 Data model

Keep the `petitions` collection (no migration; rules and indexes already cover it). Each doc is a campaign; the doc id is the URL slug.

```ts
// petitions/{slug}
type Campaign = {
  title: string;                 // 1–120
  subtitle: string;              // 0–200; also the OG description
  description: JSONContent;      // Tiptap document JSON (§2.5), ≤ 50 KB
  descriptionText: string;       // plain-text copy for OG tags, search and the list card excerpt
  goal: number;                  // 1–100,000,000
  milestones: { count: number; label: string }[]; // ascending, each ≤ goal, max 20
  startAt: Timestamp;            // UTC instant
  endAt: Timestamp | null;       // null = Indefinitely
  timeZone: string;              // IANA, e.g. "Asia/Jakarta"
  status: "draft" | "published";
  featured: boolean;             // at most one true; set in a transaction that clears the others
  signatureCount: number;
  goalReachedAt: Timestamp | null; // set by the signing transaction that hits the goal
  deletedAt: Timestamp | null;   // soft delete (§2.7)
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

Routing: `/` landing page, `/c/[slug]` campaign page. `PETITION_ID` stays as a fallback so the current deploy keeps working during the change.

### 2.2 Phases

Only `status`, the dates, `signatureCount` and `goalReachedAt` are stored. The phase is derived by one pure, unit-tested function `campaignPhase(c, now)`:

| Phase | Rule | Public page | Can sign |
|---|---|---|---|
| Draft | `status == "draft"` | 404 | no |
| Scheduled | published, `now < startAt` | full page + "Opens in 3 days" countdown, sign button disabled | no |
| Live | published, started, not ended | normal | yes |
| Ended | published, `endAt <= now` | dimmed, final count | no |

Achieved is a **badge on top of the phase**, not a phase: `achieved = goalReachedAt != null`. So a campaign can be:

- **Live + Achieved**: goal reached, signing still open until the end date (or forever if Indefinitely). "Achieved" badge, progress bar full with the count shown past 100% ("10,842 of 10,000 · 108%"), sign button stays.
- **Ended + Achieved**: dimmed, "Achieved" badge, final count, signing off.
- **Ended, not achieved**: dimmed, "Closed" badge, final count, signing off.

The signing transaction reads the campaign and refuses unless the phase is Live (the goal doesn't matter). When its increment takes `signatureCount` from below the goal to at or above it, it sets `goalReachedAt` once; Firestore transactions re-run on conflict, so it is set exactly once. Lowering the goal in the admin panel below the current count sets `goalReachedAt` to the edit time; raising it above the count clears it.

"Dimmed" = the page renders normally with reduced opacity on the progress and sign area, a badge, and the sign button replaced by a disabled state with the reason. Text stays readable (contrast checked), so it is not just faded out.

### 2.3 Dates, times and time zones

- Each campaign has an IANA time zone. The form defaults it to the admin's browser zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`); a searchable Combobox lists `Intl.supportedValuesOf("timeZone")`.
- Start and end are a date picker plus a time input, read as wall-clock time in the campaign's zone and stored as UTC `Timestamp`s. Conversion via `@date-fns/tz` (MIT, small, pairs with the installed `date-fns`).
- **Today** shortcut sets the start to now (rounded up to the next 5 minutes), so the campaign opens as soon as it is published.
- **Indefinitely** checked → `endAt = null`, end inputs disabled.
- Public pages show times in the campaign's zone with its abbreviation ("Opens 10 Nov, 19:00 WIB"); the countdown uses the visitor's clock against the UTC instant, so it is correct in any zone.

### 2.4 Caching and scheduling

Because phases are computed from the stored instants, the cached HTML never needs to change at the start or end moment:

- `/c/[slug]` keeps `revalidate = 86400`. A small client component computes the phase from the visitor's clock and flips the UI at the right second. The server refuses signatures outside the Live phase, so a wrong clock can't sign early or late.
- `/` uses `revalidate = 3600` so "newest live" and the list order catch up within an hour. Cost: about 15 small reads per regeneration, about 360 reads a day, well inside the free 50,000.
- Every admin save calls `revalidatePath` for `/` and the campaign path, so the admin's own changes show at once.
- The earlier QStash idea is not needed and is dropped.

### 2.5 Rich text description

Recommend **Tiptap 3** (MIT; `@tiptap/react` + `@tiptap/starter-kit` 3.32): headless, so it is styled with the existing shadcn tokens. Tiptap ships an open-source "Simple Editor" template with a toolbar (headings, marks, lists, links, quotes, undo/redo) that installs as source files, like shadcn; check its license when installing. Plate (`platejs`, MIT) is the shadcn-native alternative but much larger; the official shadcn registry has no editor.

Storage and rendering, safe by construction:

1. Store the Tiptap **JSON**, never HTML from the browser.
2. The server validates it with Zod (only StarterKit node and mark types, size ≤ 50 KB, link `href` must be `https:`, `http:` or `mailto:`), and derives `descriptionText`.
3. The public page renders JSON → HTML **on the server** with `@tiptap/static-renderer`. Unknown nodes are dropped, so script injection has no path, and the editor's JavaScript never reaches the public bundle. Links get `rel="noopener nofollow ugc"`.
4. Tailwind Typography (`prose`) styles the output.

No images in the description for now: they need Firebase Storage, which needs the Blaze plan.

### 2.6 Milestones

- Admin sees a list of threshold rows (count + optional label, default label "{n} signatures"), with add/remove.
- **Generate** button fills a suggested ladder up to the goal: 50, 75, 125, 200, 300, 500, 750, 1,000, 1,500, 2,000, 3,000, 5,000, 7,500, 10,000 … (×10 per decade), skipping values above the goal. Rows stay editable.
- Validation: ascending, unique, each ≤ goal, at most 20. Lowering the goal below a milestone shows an error on that row.
- Public page: ticks on the progress bar, "Next milestone: 300 (42 to go)", reached milestones listed with the date reached (from the daily rollups, §3.3).

### 2.7 Edit and delete confirmations

- **Changing the start date of a live campaign** → Alert Dialog: "This campaign is live. Moving the start to {new} will {close signing until then / keep it live}." Confirm / Cancel.
- **Delete** → Alert Dialog where the admin types the campaign slug to enable the Delete button (the GitHub pattern), so the intent is clear.
- Delete is a **soft delete** (`deletedAt`): hidden everywhere and the slug reserved, while comments and signers stay intact. A "Deleted" filter in the admin list allows restoring. Permanently purging subcollections is a separate, later action, since it can't be undone.
- Publishing a draft also gets a confirm dialog (it becomes public at once, or at its start time).
- Demo Mode: every dialog opens and validates, and the final button shows "Action disabled in Demo Mode."; the API returns 403.

### 2.8 Zod schema (sketch)

```ts
const milestone = z.object({ count: z.number().int().min(1), label: z.string().trim().max(80).default("") });
const localDateTime = z.iso.datetime({ local: true }); // "2026-11-10T19:00", wall clock in timeZone

export const campaignInputSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$/),
    title: z.string().trim().min(1, "Title is required").max(120),
    subtitle: z.string().trim().max(200).default(""),
    description: tiptapDocSchema,             // allowed node/mark types, https/mailto links, ≤ 50 KB
    goal: z.number().int().min(1).max(100_000_000),
    milestones: z.array(milestone).max(20).default([]),
    start: localDateTime,
    end: localDateTime.nullable(),            // null when Indefinitely is checked
    timeZone: z.string().refine(isIanaZone, "Unknown time zone"),
    status: z.enum(["draft", "published"]).default("draft"),
  })
  .refine((v) => v.end === null || v.end > v.start, { path: ["end"], message: "End must be after start" })
  .refine((v) => v.milestones.every((m) => m.count <= v.goal), { path: ["milestones"], message: "Milestones can't exceed the goal" })
  .refine((v) => v.milestones.every((m, i, a) => i === 0 || m.count > a[i - 1].count), { path: ["milestones"], message: "Milestones must be ascending" });
```

The same schema runs in the form (React Hook Form resolver) and the API. The form keeps an `indefinitely` checkbox mapped to `end: null`.

### 2.9 Landing page `/`

1. **Featured** campaign (hero: title, subtitle, progress, phase badge, CTA). Hidden if none.
2. **Newest live** campaign (latest `startAt` among Live), skipped if it is the featured one.
3. **All campaigns**: cards (title, subtitle, excerpt, progress, phase badge), sorted by `startAt` descending, 12 per page. Pagination uses a Firestore cursor on `startAt` (`?after=` in the URL), cached at the edge like the comments API. Needs a composite index `status + deletedAt + startAt desc`.

Phase badges on cards are computed client-side, as on the campaign page.

### 2.10 shadcn/ui pieces (new-york-v4 registry, checked 2026-11-02)

| Need | Item |
|---|---|
| Form layout and errors with React Hook Form | `field` (+ patterns from `form-rhf-demo`) |
| Milestone rows | `form-rhf-array` pattern (`useFieldArray`), `input-group` |
| Start / end date | `calendar` + `popover` (`date-picker-with-presets` for **Today**), time via `input type="time"` |
| Indefinitely | `checkbox` |
| Time zone | `combobox` (`command` + `popover`) |
| Confirmations | `alert-dialog` |
| Campaign table, phase badges | `table`, `badge`, `dropdown-menu` for row actions |
| Landing list paging | `pagination` |
| Description | Tiptap (not in the shadcn registry) |

These bring in Radix and `react-day-picker`, ending ADR 0002's "no Radix" rule. Everything except `pagination` and badges is admin-only, so the public bundle barely grows. ADR 0004 records this; add `components.json` so the shadcn CLI installs items.

### 2.11 Demo Mode

- Seed data has 5 campaigns covering every state (featured flag on one; one live, one live + achieved past 100%, one scheduled, one ended + achieved, one ended + closed) so the landing page and badges are all visible.
- All admin forms and dialogs work up to the final action, which shows the Demo Mode toast; APIs return 403 before touching Firestore.

## 3. Dashboard metrics

### 3.1 What is collected, and from where

| Metric | Source | How |
|---|---|---|
| Signatures per bucket, cumulative, gain vs previous period | Firestore | Hourly rollup written in the signing transaction (§3.3) |
| Comments | Firestore | Same as signatures (every signature is a comment) |
| Progress, milestones reached and when, Achieved date | Firestore | `signatureCount`, `goal`, rollups, `goalReachedAt` |
| Pace to goal | derived | Needed per day = remaining ÷ days left (with an end date); projected finish = remaining ÷ 7-day average |
| Page views, unique visitors, sessions, bounce rate, session length | PostHog → Firestore | HogQL on `events` and `sessions` (`$is_bounce`, `$session_duration`), copied daily |
| New vs returning visitors | PostHog → Firestore | Person first seen before the day |
| Conversion (visitors → signers) | derived | Signatures ÷ unique visitors, same period and campaign |
| Sign funnel: view → started → code sent → verified → signed | PostHog | Custom events with a `campaign` property; no personal data |
| Referrers, UTM, share channel clicks | PostHog → Firestore | `$referring_domain`, `utm_*`, `share_clicked {channel}` |
| Countries, devices, browsers | PostHog → Firestore | `$geoip_country_code`, `$device_type`, `$browser` |
| Sign-in codes sent per provider vs daily cap | Upstash | Existing `mail:{provider}:{date}` counters |
| Rate-limit blocks, Turnstile failures, honeypot hits | Upstash | `INCR metric:{date}:{name}` on each event |

The campaign selector at the top includes **All campaigns** (sums across campaigns).

### 3.2 Ranges

24h and 1D are the same, so 1D is dropped.

| Range | Bucket | Points | Compared with | Data |
|---|---|---|---|---|
| 24h | 1 hour | 24 | previous 24 h | signatures: rollups · traffic: PostHog live |
| 3D | 3 hours | 24 | previous 3 days | same |
| 7D | 6 hours | 28 | previous 7 days | same |
| 30D | 1 day | 30 | previous 30 days | Firestore rollups only |
| 3M | 1 day | ~90 | previous 3 months | Firestore |
| 6M | 1 week | 26 | previous 6 months | Firestore |
| 1Y | 1 week | 52 | previous year | Firestore |
| All | 1 month (1 week if < 6 months) | varies | none | Firestore |

Rules: buckets in the selected campaign's time zone (All campaigns: the admin's zone); weeks start Monday; the partial current bucket is drawn lighter and left out of the delta; delta shows `+12.4% (+318)` with an arrow and up/down text, never color alone; previous 0 → "new"; comparison hidden when no full previous period exists; default 7D; range kept in the URL (`?range=30d`).

### 3.3 Storage — the efficient way (answer to Q8)

Everything the dashboard draws for 30D and longer comes from **one small Firestore doc per campaign per UTC day**. PostHog is only asked live for the last 7 days (fresh, hourly), plus one batch query a day.

```
petitions/{slug}/daily/{YYYY-MM-DD}   // UTC day
{
  sig: number, sigH: number[24],                          // written in the signing transaction
  views: number, visitors: number, sessions: number,      // written by the nightly job
  bounces: number, durationSum: number, newVisitors: number,
  referrers: Record<string, number>, countries: Record<string, number>,
  devices: Record<string, number>, shares: Record<string, number>,   // top 10 each + "other"
  funnel: { started: number, codeSent: number, verified: number },
}
```

- **Signatures**: the signing transaction adds `sig +1` and `sigH[hour] +1` (one extra write per signature; 4 instead of 3).
- **Traffic**: a **Vercel Cron job once a day** (Hobby allows daily) calls `/api/cron/rollup` with `CRON_SECRET`. It runs **one** HogQL query for yesterday grouped by campaign path and hour, plus one for the breakdowns, and writes one doc per campaign. The first run backfills all history PostHog still has. After that PostHog retention no longer matters: Firestore keeps the history forever.
- **Why UTC days with hourly signature buckets**: a campaign's time zone can change later. Re-bucketing UTC hours into any zone works at hour precision (half-hour zones such as India are shifted by 30 minutes; acceptable for charts).
- **Unique visitors don't add up across days.** Long ranges show the "sum of daily visitors" labelled as such; exact uniques are only shown for ≤ 7D, where PostHog is queried live.

Cost on free tiers:

| | Per day | Free limit |
|---|---|---|
| PostHog query API | ~2 (cron) + live 24h/3D/7D queries cached 10–60 min | 120 per hour, organisation-wide |
| Firestore writes | 1 per signature + 1 per campaign (cron) | 20,000/day |
| Firestore reads per dashboard load | ≤ 366 per campaign for 1Y, cached 5 min per (campaign, range) | 50,000/day |
| Vercel Cron | 1 job, daily | Hobby: daily jobs allowed |

"All campaigns" + "All" range: add a `monthly/{YYYY-MM}` summary doc written by the same cron, so long ranges across many campaigns stay at a few dozen reads.

### 3.4 Dashboard layout and charts

One filter row at the top: campaign select, then the range control (ToggleGroup on desktop, Select on mobile, like shadcn `chart-area-interactive`). Every card follows that one range.

1. **KPI tiles:** signatures in period, unique visitors, conversion %, progress to goal; each with delta vs previous period and a sparkline (`section-cards` pattern from `dashboard-01`).
2. **Signatures over time:** area chart, previous period as a muted dashed line on the same axis. Per-bucket / cumulative toggle; cumulative mode draws milestones and goal as labelled reference lines.
3. **Pace card:** progress meter and "need 312/day, averaging 280/day, projected 14 Dec" (projected date only for Indefinitely).
4. **Visitors and sessions:** two-series line chart; bounce rate and median session length as tiles beside it, never a second y-axis.
5. **Funnel:** horizontal bars view → started → code sent → verified → signed, with step %.
6. **Breakdowns:** ranked bars in one hue for referrers, share channels, countries, devices; top 6 + Other.
7. **Health (live mode):** codes sent per provider against daily caps; rate-limit blocks, Turnstile failures, honeypot hits as tiles with deltas.
8. **Campaign comparison (All campaigns view):** table of campaigns with signatures in period, delta, conversion and phase.

Chart rules: one y-axis per chart; categorical colors assigned per entity in a fixed order, never by rank; 2 px lines; hover crosshair and tooltip everywhere; "View as table" per chart; dark-mode colors validated separately; old chart kept at reduced opacity while a new range loads. Charts use shadcn `chart` (Recharts 3.8), loaded with `next/dynamic` so Recharts stays out of other bundles. Add `--chart-1…5` tokens.

### 3.5 Demo Mode

Generate deterministic sample rollups from the seed (fixed seed, growth curves ending at each seed campaign's count, weekly rhythm, one share spike) for every range, badged "sample data". Traffic for ≤ 7D stays real PostHog when the key is set.

## 4. Task breakdown

Ordered; each row is one PR (≤ ~400 lines).

| # | Task | Tier |
|---|---|---|
| 1 | ADR 0004 (multi-campaign, Radix/Recharts/Tiptap in admin, landing page cache), `components.json`, chart tokens | S |
| 2 | Campaign type, Zod schema (incl. Tiptap doc schema), `campaignPhase()`, wall-clock ↔ UTC helpers, milestone ladder generator, all with tests; seed with 5 campaigns | M |
| 3 | `/c/[slug]` page: server-rendered rich description, phase banner + countdown, Achieved badge (live or ended), dimmed Ended state, progress past 100%, milestone ticks | M |
| 4 | Signing enforces the Live window (not the goal), sets `goalReachedAt` once, writes hourly rollup (transaction + tests) | M |
| 5 | Landing page `/`: featured, newest live, paginated list, index, `revalidate = 3600` | M |
| 6 | Admin campaign list + API (`POST/PATCH/DELETE /api/admin/campaigns`, feature toggle, soft delete/restore, 403 in Demo Mode) | M |
| 7 | Campaign form part 1: Field layout, title/subtitle/goal, dates + times + Today + Indefinitely, time-zone Combobox | M |
| 8 | Campaign form part 2: Tiptap editor, milestone rows + Generate, preview | M |
| 9 | Confirm dialogs: publish, live start-date change, delete with typed slug | S |
| 10 | PostHog custom events with `campaign` property (sign funnel, share clicks) | S |
| 11 | Nightly rollup cron (PostHog → Firestore daily + monthly docs, backfill, `CRON_SECRET`) | M |
| 12 | Range model (presets, buckets, time-zone re-bucketing, previous period, delta) with tests; live HogQL for ≤ 7D with caching | M |
| 13 | Dashboard: filter row, KPI tiles, signatures chart with milestones, pace card | M |
| 14 | Dashboard: traffic, funnel, breakdowns, campaign comparison | M |
| 15 | Health counters (rate-limit, Turnstile, honeypot) and provider quota meters | S |
| 16 | Demo sample rollup generator | S |

Totals: 11 M, 5 S. Order: Campaigns 1–9 (the public site works with many campaigns after 5), then Metrics 10–16. Task 10 can ship early so funnel data starts accumulating.

## 5. Remaining assumptions to confirm while building

- One featured campaign at a time.
- Soft delete with restore; permanent purge is a separate, later action.

## Sources

- shadcn registry, new-york-v4, fetched 2026-11-02 from `ui.shadcn.com/r`: `chart` (recharts 3.8.0), `calendar`, `field`, `form-rhf-array`, `date-picker-with-presets`, `combobox`, `alert-dialog`, `chart-area-interactive`, `dashboard-01`. No editor item in the official registry.
- npm, 2026-11-02: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/static-renderer` 3.32.2 (MIT); `platejs` 53.5.2 (MIT); `@date-fns/tz` 1.5.0 (MIT).
- PostHog API docs, rate limits (query endpoint 120/hour, organisation-wide): https://www.posthog.com/docs/api.
- Repo: `src/lib/petition.ts`, `src/app/api/comments/route.ts`, `src/lib/server/posthog.ts`, `src/lib/server/ratelimit.ts`, `src/lib/server/email.ts`, ADR 0001, ADR 0002.
