import { campaignPhase, wallClockToUtc, type Campaign } from "./campaign";
import type { CampaignFormValues } from "./campaign-form";

/** What a save needs confirmed: publishing a draft, or moving the start of a live campaign. Empty = save directly. */
export function confirmationsFor(before: Campaign | null, v: CampaignFormValues, now = Date.now()): string[] {
  const out: string[] = [];
  if (v.status === "published" && (before === null || before.status === "draft")) {
    out.push("Publishing makes this campaign public at once. Signing opens at its start time.");
  }
  if (before && campaignPhase(before, now) === "live") {
    const start = wallClockToUtc(`${v.startDate}T${v.startTime}`, v.timeZone).getTime();
    if (start !== Date.parse(before.startAt)) {
      out.push(
        start > now
          ? "This campaign is live. Moving the start into the future closes signing until then."
          : "This campaign is live. Moving the start keeps it live.",
      );
    }
  }
  return out;
}
