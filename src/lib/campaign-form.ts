import { utcToWallClock, type Campaign, type Milestone, type RichTextNode } from "./campaign";
import type { CampaignInput } from "./campaign-schema";

/** The admin form's shape: dates and times as separate inputs, read as wall-clock time in `timeZone`. */
export type CampaignFormValues = {
  slug: string;
  title: string;
  subtitle: string;
  goal: number;
  startDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endDate: string;
  endTime: string;
  indefinitely: boolean;
  timeZone: string;
  status: "draft" | "published";
  milestones: Milestone[];
  description: RichTextNode;
};

export const emptyDoc: RichTextNode = { type: "doc", content: [] };

export const slugify = (title: string) =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // accents → base letters
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");

const split = (local: string) => local.split("T") as [string, string];

/** "Today": now, rounded up to the next 5 minutes, as wall-clock date and time in `timeZone`. */
export function soon(timeZone: string, now = Date.now()) {
  const fiveMin = 5 * 60_000;
  const [date, time] = split(utcToWallClock(new Date(Math.ceil(now / fiveMin) * fiveMin), timeZone));
  return { date, time };
}

export function toFormValues(c: Campaign | null, defaultZone: string, now = Date.now()): CampaignFormValues {
  if (!c) {
    const start = soon(defaultZone, now);
    return {
      slug: "", title: "", subtitle: "", goal: 1000,
      startDate: start.date, startTime: start.time, endDate: "", endTime: "", indefinitely: true,
      timeZone: defaultZone, status: "draft", milestones: [], description: emptyDoc,
    };
  }
  const [startDate, startTime] = split(utcToWallClock(c.startAt, c.timeZone));
  const [endDate, endTime] = c.endAt ? split(utcToWallClock(c.endAt, c.timeZone)) : ["", ""];
  return {
    slug: c.slug, title: c.title, subtitle: c.subtitle, goal: c.goal,
    startDate, startTime, endDate, endTime, indefinitely: c.endAt === null,
    timeZone: c.timeZone, status: c.status, milestones: c.milestones, description: c.description,
  };
}

/** Form values → the API body checked by `campaignInputSchema`. */
export function toInput(v: CampaignFormValues): Record<keyof CampaignInput, unknown> {
  return {
    slug: v.slug,
    title: v.title,
    subtitle: v.subtitle,
    description: v.description,
    goal: v.goal,
    milestones: v.milestones,
    start: `${v.startDate}T${v.startTime}`,
    end: v.indefinitely ? null : `${v.endDate}T${v.endTime}`,
    timeZone: v.timeZone,
    status: v.status,
  };
}

// Schema paths → the form field that shows the message.
export const fieldFor: Record<string, keyof CampaignFormValues> = { start: "startDate", end: "endDate" };
