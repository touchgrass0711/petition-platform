import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { wallClockToUtc } from "@/lib/campaign";
import { docToText, type CampaignInput } from "@/lib/campaign-schema";

/** Admin form input → the stored campaign fields it owns (counts, flags and timestamps are set by the routes). */
export function inputToDoc(input: CampaignInput) {
  const { title, subtitle, description, goal, milestones, start, end, timeZone, status } = input;
  return {
    title,
    subtitle,
    description,
    descriptionText: docToText(description),
    goal,
    milestones,
    startAt: Timestamp.fromDate(wallClockToUtc(start, timeZone)),
    endAt: end === null ? null : Timestamp.fromDate(wallClockToUtc(end, timeZone)),
    timeZone,
    status,
  };
}
