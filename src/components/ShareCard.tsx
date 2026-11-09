import { PartyPopper } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { milestoneLabel, type Milestone } from "@/lib/campaign";
import { DEMO_MODE } from "@/lib/demo";
import { ShareButtons } from "./ShareButtons";

const REASON_MAX = 140; // keeps the prefilled post short enough for X with the link

/** The prefilled share text: the signer's own reason when they gave one, else a plain "I signed". */
export function shareText(title: string, reason = "") {
  const r = reason.trim().replace(/\s+/g, " ");
  if (!r) return `I signed: ${title}`;
  return `I signed "${title}" because ${r.length > REASON_MAX ? `${r.slice(0, REASON_MAX - 1)}…` : r}`;
}

/**
 * "Share it to help reach 750 signatures." No exact "you're #N": the page count can be up to a day old (edge cache).
 * Undefined past the goal with no milestone left, so the card keeps its default line.
 */
export function nextStepLine(count: number, goal: number, milestones: Milestone[]) {
  const next = milestones.find((m) => m.count > count);
  const target = next ? milestoneLabel(next) : count < goal ? `${goal.toLocaleString("en-US")} signatures` : null;
  return target ? `Share it to help reach ${target}.` : undefined;
}

type Props = { title: string; url: string; alreadySigned?: boolean; reason?: string; step?: string; menu?: ReactNode };

/** Replaces the sign form once this visitor has signed: one signature, then share. */
export function ShareCard({ title, url, alreadySigned = false, reason, step, menu }: Props) {
  return (
    <Card className="relative shadow-lg">
      {menu && <div className="absolute top-4 right-4">{menu}</div>}
      <CardHeader className="items-center text-center">
        <PartyPopper className="mb-1 size-8" aria-hidden />
        <CardTitle className="text-xl">{alreadySigned ? "You have already signed this petition." : "Thanks for signing!"}</CardTitle>
        <CardDescription>
          {DEMO_MODE && !alreadySigned ? "Demo Mode: nothing was saved. " : ""}
          {step ?? "Now help it reach the goal by sharing it."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ShareButtons url={url} text={shareText(title, reason)} />
      </CardContent>
    </Card>
  );
}
