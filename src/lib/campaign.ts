import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

export type Milestone = { count: number; label: string };

// Tiptap/ProseMirror JSON, validated by `richTextDocSchema` before it is stored.
export type RichTextNode = {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
  content?: RichTextNode[];
};

// Instants are ISO 8601 UTC strings so a campaign crosses the server/client boundary as is.
export type Campaign = {
  slug: string;
  title: string;
  subtitle: string;
  description: RichTextNode;
  descriptionText: string;
  goal: number;
  milestones: Milestone[];
  startAt: string;
  endAt: string | null; // null = Indefinitely
  timeZone: string; // IANA
  status: "draft" | "published";
  featured: boolean;
  signatureCount: number;
  goalReachedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CampaignSummary = Omit<Campaign, "description">;

export type Phase = "draft" | "scheduled" | "live" | "ended";

type PhaseFields = Pick<Campaign, "status" | "startAt" | "endAt" | "deletedAt">;

/** The one source of truth for whether a campaign is visible and signable. Deleted counts as draft: hidden, not signable. */
export function campaignPhase(c: PhaseFields, now: Date | number = Date.now()): Phase {
  if (c.status !== "published" || c.deletedAt !== null) return "draft";
  const t = typeof now === "number" ? now : now.getTime();
  const start = Date.parse(c.startAt);
  // An unparseable start must never read as "live".
  if (Number.isNaN(start) || t < start) return "scheduled";
  if (c.endAt !== null && !(t < Date.parse(c.endAt))) return "ended";
  return "live";
}

export const canSign = (c: PhaseFields, now?: Date | number) => campaignPhase(c, now) === "live";
/** True when this signature is the one that reaches the goal (or the goal was reached before it was ever recorded). */
export const reachesGoal = (c: Pick<Campaign, "signatureCount" | "goal" | "goalReachedAt">) =>
  c.goalReachedAt === null && c.signatureCount + 1 >= c.goal;

/** goalReachedAt after an admin edit: reached now if the new goal is at or below the count, cleared if above it. */
export const goalReachedAfterEdit = (c: Pick<Campaign, "signatureCount" | "goalReachedAt">, goal: number, now: string) =>
  c.signatureCount >= goal ? (c.goalReachedAt ?? now) : null;

export const isAchieved = (c: Pick<Campaign, "goalReachedAt">) => c.goalReachedAt !== null;

export function isIanaZone(zone: string): boolean {
  // Intl also accepts raw offsets like "+07:00"; campaigns need a named zone so DST is followed.
  if (!/^[A-Za-z]/.test(zone)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * "2026-11-10T19:00" read as wall-clock time in `timeZone` → UTC instant.
 * A time skipped by a DST jump resolves forward (02:30 on a spring-forward night → 03:30).
 */
export function wallClockToUtc(local: string, timeZone: string): Date {
  const m = LOCAL.exec(local);
  if (!m) throw new RangeError(`Invalid local date-time: ${local}`);
  const [y, mo, d, h, mi, s] = m.slice(1).map((v) => Number(v ?? 0));
  return new Date(new TZDate(y, mo - 1, d, h, mi, s, timeZone).getTime());
}

/** UTC instant → "2026-11-10T19:00" wall-clock time in `timeZone` (the form's input format). */
export function utcToWallClock(instant: Date | string, timeZone: string): string {
  return format(new TZDate(new Date(instant).getTime(), timeZone), "yyyy-MM-dd'T'HH:mm");
}

export const MILESTONES_MAX = 20;
const FIRST_RUNG = [50, 75, 125, 200, 300];
const DECADE = [5, 7.5, 10, 15, 20, 30];

/** Suggested ladder 50, 75, 125, 200, 300, 500, 750, 1,000, 1,500 … up to `goal`, at most 20 rungs (the highest kept). */
export function milestoneLadder(goal: number): Milestone[] {
  const counts = [...FIRST_RUNG];
  for (let scale = 100; DECADE[0] * scale <= goal; scale *= 10) counts.push(...DECADE.map((m) => m * scale));
  return counts
    .filter((n) => n <= goal)
    .slice(-MILESTONES_MAX)
    .map((count) => ({ count, label: "" }));
}

export const milestoneLabel = (m: Milestone) => m.label || `${m.count.toLocaleString("en-US")} signatures`;
