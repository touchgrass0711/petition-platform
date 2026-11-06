"use client";

import { formatDistanceStrict } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { isAchieved, type Campaign } from "@/lib/campaign";
import { DEMO_MODE } from "@/lib/demo";
import { formatInZone, usePhase } from "@/lib/use-phase";

export function PhaseBadge({ campaign, renderedAt }: { campaign: Campaign; renderedAt: number }) {
  const { phase, now } = usePhase(campaign, renderedAt);
  const achieved = isAchieved(campaign);
  const label =
    phase === "scheduled"
      ? `Opens in ${formatDistanceStrict(Date.parse(campaign.startAt), now)} · ${formatInZone(campaign.startAt, campaign.timeZone)}`
      : phase === "ended"
        ? achieved ? "Achieved · signing closed" : "Closed"
        : DEMO_MODE ? "Live demo · nothing is saved" : "Open for signatures";
  return (
    <div className="mb-5 flex flex-wrap justify-center gap-2">
      <Badge>
        <span className={phase === "live" ? "size-1.5 rounded-full bg-foreground" : "size-1.5 rounded-full border border-muted-foreground"} aria-hidden />
        {label}
      </Badge>
      {achieved && phase === "live" && <Badge className="text-foreground">Achieved</Badge>}
    </div>
  );
}
