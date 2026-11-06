"use client";

import { useEffect, useState } from "react";
import { campaignPhase, type Campaign } from "@/lib/campaign";

type Times = Pick<Campaign, "status" | "startAt" | "endAt" | "deletedAt">;

/**
 * Phase from the visitor's clock, so cached HTML flips at the exact start/end second.
 * The first render uses the server's render time to keep hydration stable. Display only:
 * the signing API decides on its own clock.
 */
export function usePhase(c: Times, renderedAt: number) {
  const [now, setNow] = useState(renderedAt);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const interval = setInterval(tick, 60_000);
    const timers = [c.startAt, c.endAt]
      .map((t) => (t ? Date.parse(t) - Date.now() : -1))
      .filter((ms) => ms > 0 && ms < 2 ** 31 - 1) // setTimeout's max delay
      .map((ms) => setTimeout(tick, ms + 50));
    return () => {
      clearInterval(interval);
      timers.forEach(clearTimeout);
    };
  }, [c.startAt, c.endAt]);
  return { phase: campaignPhase(c, now), now };
}

/** "10 Nov, 19:00 GMT+7" in the campaign's own zone. */
export const formatInZone = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso));
