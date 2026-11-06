"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isAchieved, type CampaignSummary, type Phase } from "@/lib/campaign";
import { cn } from "@/lib/utils";
import { usePhase } from "@/lib/use-phase";

const PHASE_LABEL: Record<Phase, string> = { draft: "Draft", scheduled: "Opens soon", live: "Live", ended: "Closed" };

export function CampaignCard({ campaign, renderedAt, large = false }: { campaign: CampaignSummary; renderedAt: number; large?: boolean }) {
  const { phase } = usePhase(campaign, renderedAt);
  const achieved = isAchieved(campaign);
  const pct = Math.round((campaign.signatureCount / campaign.goal) * 100);
  const href = `/c/${campaign.slug}`;
  return (
    <Card className={cn("flex h-full flex-col transition-colors hover:border-foreground/20", large && "shadow-lg")}>
      <CardContent className="flex flex-1 flex-col gap-3 pt-6">
        <div className="flex flex-wrap gap-2">
          <Badge>{phase === "ended" && achieved ? "Achieved · closed" : PHASE_LABEL[phase]}</Badge>
          {achieved && phase === "live" && <Badge className="text-foreground">Achieved</Badge>}
        </div>
        <h3 className={cn("font-semibold tracking-tight text-balance", large ? "text-2xl sm:text-3xl" : "text-lg")}>
          <Link href={href} className="after:absolute after:inset-0 focus-visible:outline-none">
            {campaign.title}
          </Link>
        </h3>
        {campaign.subtitle && <p className="text-sm text-pretty text-muted-foreground">{campaign.subtitle}</p>}
        {large && <p className="line-clamp-3 text-sm text-muted-foreground">{campaign.descriptionText}</p>}
        <div className="mt-auto pt-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium tabular-nums">{campaign.signatureCount.toLocaleString("en-US")} signatures</span>
            <span className="text-muted-foreground tabular-nums">{pct}%</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-muted" aria-hidden>
            <div
              className={cn("h-full rounded-full", phase === "ended" ? "bg-muted-foreground" : "bg-primary")}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        </div>
        {large && (
          <span className={cn(buttonVariants({ size: "sm" }), "mt-2 w-fit")} aria-hidden>
            {phase === "live" ? "Read and sign" : "Read more"} <ArrowRight />
          </span>
        )}
      </CardContent>
    </Card>
  );
}
