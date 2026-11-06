import type { CampaignSummary } from "@/lib/campaign";
import type { DailyDoc } from "./range";

// Demo Mode: deterministic daily rollups per campaign. Same slug + dates → same numbers on every load and server.

const DAY_MS = 86_400_000;
const MAX_DAYS = 400; // enough for 1Y plus its previous period's start
// Signatures by UTC hour; peaks around 12:00–14:00 UTC (evening in Jakarta).
const HOURS = [2, 1, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11, 10, 8, 7, 6, 5, 4, 4, 3, 2];
const REFERRERS = { "x.com": 0.34, whatsapp: 0.27, $direct: 0.18, "google.com": 0.09, "facebook.com": 0.07, "t.co": 0.05 };
const COUNTRIES = { ID: 0.62, MY: 0.12, SG: 0.09, AU: 0.06, US: 0.05, NL: 0.03, other: 0.03 };
const DEVICES = { Mobile: 0.72, Desktop: 0.25, Tablet: 0.03 };
const SHARES = { whatsapp: 0.45, x: 0.3, copy: 0.17, native: 0.08 };

function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Splits `total` into integers proportional to `weights` (largest remainder), so the parts add up exactly. */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (w / sum) * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k][1]]++;
  return out;
}

const split = (n: number, shares: Record<string, number>) => {
  const keys = Object.keys(shares);
  return Object.fromEntries(allocate(n, Object.values(shares)).map((v, i) => [keys[i], v]).filter(([, v]) => (v as number) > 0));
};

/** Growth curve ending at the campaign's real signature count, with a weekly rhythm and one share spike. */
export function sampleDocs(c: Pick<CampaignSummary, "slug" | "startAt" | "endAt" | "signatureCount">, now: number): DailyDoc[] {
  const start = Math.max(Date.parse(c.startAt), now - MAX_DAYS * DAY_MS);
  const stop = Math.min(c.endAt ? Date.parse(c.endAt) : now, now);
  if (!(stop > start) || c.signatureCount <= 0) return [];
  const first = Date.UTC(new Date(start).getUTCFullYear(), new Date(start).getUTCMonth(), new Date(start).getUTCDate());
  const days = Math.max(1, Math.ceil((stop - first) / DAY_MS));
  const r = rng(c.slug);
  const spike = Math.floor(days * (0.35 + r() * 0.4));
  const weights = Array.from({ length: days }, (_, i) => {
    const t = (i + 1) / days;
    const weekend = [0, 6].includes(new Date(first + i * DAY_MS).getUTCDay()) ? 0.7 : 1;
    return (0.4 + t) * weekend * (0.8 + r() * 0.4) * (i === spike ? 4 : i === spike + 1 ? 2 : 1);
  });
  return allocate(c.signatureCount, weights).map((sig, i) => {
    const date = new Date(first + i * DAY_MS).toISOString().slice(0, 10);
    const views = Math.round(sig * (8 + r() * 4)) + 5;
    const visitors = Math.round(views * 0.7);
    const sessions = Math.round(visitors * 1.1);
    // Today only up to the current hour, so no signature lands in the future.
    const hoursSoFar = first + (i + 1) * DAY_MS > now ? new Date(now).getUTCHours() + 1 : 24;
    const sigH = allocate(sig, HOURS.map((w, h) => (h < hoursSoFar ? w : 0)));
    return {
      date,
      sig,
      sigH: Object.fromEntries(sigH.flatMap((v, h) => (v ? [[String(h).padStart(2, "0"), v]] : []))),
      views,
      visitors,
      sessions,
      bounces: Math.round(sessions * 0.42),
      durationSum: sessions * 74,
      funnel: { started: Math.round(sig * 2.6), codeSent: Math.round(sig * 1.8), verified: Math.round(sig * 1.25) },
      referrers: split(views, REFERRERS),
      countries: split(views, COUNTRIES),
      devices: split(views, DEVICES),
      shares: split(Math.round(sig * (i === spike ? 1.2 : 0.3)), SHARES),
    };
  });
}
