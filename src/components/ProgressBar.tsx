import { formatDistanceToNow } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { milestoneLabel, type Milestone } from "@/lib/campaign";
import type { Comment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SignerAvatar } from "./SignerAvatar";

type Props = { count: number; goal: number; milestones?: Milestone[]; dimmed?: boolean; recent?: Comment[] };

/** Newest signers first, from comments already on the page (no extra read). Pinned order is ignored here. */
export const latestSigners = (comments: Comment[], n = 3) =>
  [...comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, n);

export function ProgressBar({ count, goal, milestones = [], dimmed = false, recent = [] }: Props) {
  // The count keeps going past the goal ("108%"); only the bar stops at full.
  const pct = goal > 0 ? Math.round((count / goal) * 100) : 0;
  const next = milestones.find((m) => m.count > count);
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-4xl font-bold tracking-tight tabular-nums">{count.toLocaleString("en-US")}</p>
            <p className="text-sm text-muted-foreground">signatures</p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p className="font-medium text-foreground tabular-nums">{pct}%</p>
            <p>of {goal.toLocaleString("en-US")} goal</p>
          </div>
        </div>
        <div
          className="relative mt-4 h-2 rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={Math.min(100, pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${count.toLocaleString("en-US")} of ${goal.toLocaleString("en-US")} signatures, ${pct}%`}
          aria-label="Signature progress"
        >
          <div
            className={cn("h-full rounded-full transition-all duration-700", dimmed ? "bg-muted-foreground" : "bg-primary")}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
          {milestones
            .filter((m) => m.count < goal && m.count / goal >= 0.04) // denser ticks near zero are noise
            .map((m) => (
              <span
                key={m.count}
                aria-hidden
                title={milestoneLabel(m)}
                className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-background"
                style={{ left: `${(m.count / goal) * 100}%` }}
              />
            ))}
        </div>
        {next && !dimmed && (
          <p className="mt-3 text-sm text-muted-foreground">
            Next milestone: <span className="text-foreground">{milestoneLabel(next)}</span> (
            {(next.count - count).toLocaleString("en-US")} to go)
          </p>
        )}
        {recent.length > 0 && !dimmed && (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <div aria-hidden className="flex -space-x-1.5 [&>*]:size-6 [&>*]:ring-2 [&>*]:ring-card">
              {recent.map((c) => (
                <SignerAvatar key={c.id} name={c.name} avatarUrl={c.avatarUrl} />
              ))}
            </div>
            <p className="truncate">
              Latest: <span className="text-foreground">{recent[0].name}</span>,{" "}
              <time dateTime={recent[0].createdAt} suppressHydrationWarning>
                {formatDistanceToNow(new Date(recent[0].createdAt), { addSuffix: true })}
              </time>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
