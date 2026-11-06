"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deltaText, ratio, seriesRows } from "@/lib/metrics/chart";
import { delta } from "@/lib/metrics/range";
import type { Summary } from "@/lib/metrics/summary";
import type { Health } from "@/lib/server/health";

// Traffic, funnel, breakdowns and the all-campaigns comparison: the lower half of the metrics dashboard.

const TrafficChart = dynamic(() => import("./TrafficChart"), {
  ssr: false,
  loading: () => <div className="h-56 animate-pulse rounded-lg bg-muted/50" />,
});

const fmt = (n: number) => n.toLocaleString("en-US");
const pct = (v: number | null) => (v === null ? "–" : `${v.toFixed(1)}%`);
const BREAKDOWN_TITLE = { referrers: "Referrers", shares: "Share buttons", countries: "Countries", devices: "Devices" } as const;
const SOURCE_NAME: Record<string, string> = { $direct: "Direct", other: "Other" };

export function Insights({ d, onPick }: { d: Summary; onPick: (slug: string) => void }) {
  const t = d.traffic;
  return (
    <>
      <div className="grid gap-4 md:gap-6 xl:grid-cols-[1fr_320px]">
        <TrafficCard d={d} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 md:gap-6">
          <Stat label="Bounce rate" value={pct(ratio(t.bounces.current, t.sessions.current))} hint="Sessions with one page view" />
          <Stat
            label="Average session"
            value={t.sessions.current > 0 ? `${Math.round(t.durationSum.current / t.sessions.current)} s` : "–"}
            hint={`${fmt(t.sessions.current)} sessions`}
          />
        </div>
      </div>
      <div className="grid gap-4 md:gap-6 xl:grid-cols-2">
        <FunnelCard f={d.funnel} />
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Where signers come from</CardTitle>
            <CardDescription>Page views by source, top 6 and Other; share-button clicks by channel.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            {(Object.keys(BREAKDOWN_TITLE) as (keyof typeof BREAKDOWN_TITLE)[]).map((k) => (
              <Bars key={k} title={BREAKDOWN_TITLE[k]} rows={d.breakdowns[k]} />
            ))}
          </CardContent>
        </Card>
      </div>
      {d.comparison.length > 0 && <Comparison rows={d.comparison} onPick={onPick} />}
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5 md:p-6">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function TrafficCard({ d }: { d: Summary }) {
  const [asTable, setAsTable] = useState(false);
  const visitors = seriesRows(d.traffic.visitors, d.starts, d.unit, d.timeZone);
  const sessions = d.traffic.sessions.buckets;
  const rows = visitors.map((r, i) => ({ label: r.label, visitors: r.current, sessions: sessions[i] ?? 0 }));
  // Rollups are daily; at hour buckets each day would draw as one spike, so short ranges show totals only.
  const daily = d.unit !== "hour";
  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>Visitors and sessions</CardTitle>
          <CardDescription>
            {fmt(d.traffic.visitors.current)} visitors · {fmt(d.traffic.views.current)} page views
          </CardDescription>
        </div>
        {daily && (
          <Button size="sm" variant="ghost" aria-pressed={asTable} onClick={() => setAsTable(!asTable)}>
            {asTable ? "View as chart" : "View as table"}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!daily ? (
          <p className="text-sm text-muted-foreground">Traffic is collected per day. Choose 30D or longer to see it over time.</p>
        ) : asTable ? (
          <div className="max-h-56 overflow-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="py-2 font-medium">Period</th>
                  <th className="py-2 text-right font-medium">Visitors</th>
                  <th className="py-2 text-right font-medium">Sessions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="py-1.5">{r.label}</td>
                    <td className="py-1.5 text-right">{fmt(r.visitors)}</td>
                    <td className="py-1.5 text-right">{fmt(r.sessions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <TrafficChart rows={rows} />
        )}
      </CardContent>
    </Card>
  );
}

function FunnelCard({ f }: { f: Summary["funnel"] }) {
  const steps = [
    ["Viewed the page", f.views],
    ["Started signing", f.started],
    ["Code sent", f.codeSent],
    ["Code verified", f.verified],
    ["Signed", f.signed],
  ] as const;
  const top = Math.max(1, f.views);
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Signing funnel</CardTitle>
        <CardDescription>Each step as a share of the step before it.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-4">
          {steps.map(([label, n], i) => (
            <li key={label} className="text-sm">
              <div className="flex justify-between gap-2">
                <span>{label}</span>
                <span className="tabular-nums">
                  {fmt(n)}
                  {i > 0 && <span className="ml-2 text-muted-foreground">{pct(ratio(n, steps[i - 1][1]))}</span>}
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-muted">
                <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${Math.min(100, (n / top) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function Bars({ title, rows }: { title: string; rows: [string, number][] }) {
  const top = Math.max(1, ...rows.map(([, v]) => v));
  return (
    <section>
      <h4 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{title}</h4>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No data in this range.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map(([k, v]) => (
            <li key={k} className="text-sm">
              <div className="flex justify-between gap-2">
                <span className="truncate">{SOURCE_NAME[k] ?? k}</span>
                <span className="text-muted-foreground tabular-nums">{fmt(v)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-muted">
                <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${(v / top) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Comparison({ rows, onPick }: { rows: Summary["comparison"]; onPick: (slug: string) => void }) {
  const sorted = [...rows].sort((a, b) => b.current - a.current);
  return (
    <Card className="overflow-hidden rounded-2xl">
      <CardHeader>
        <CardTitle>Campaigns</CardTitle>
        <CardDescription>Signatures in this range, change against the previous period, and conversion.</CardDescription>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="border-y bg-muted/40 text-left text-xs text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3 font-medium sm:px-6">Campaign</th>
              <th className="px-4 py-3 font-medium">Phase</th>
              <th className="px-4 py-3 text-right font-medium">Signatures</th>
              <th className="px-4 py-3 text-right font-medium">Change</th>
              <th className="px-4 py-3 text-right font-medium sm:px-6">Conversion</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((r) => (
              <tr key={r.slug} className="hover:bg-muted/40">
                <td className="px-4 py-3 font-medium sm:px-6">
                  <button type="button" onClick={() => onPick(r.slug)} className="text-left hover:underline">
                    {r.title}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <Badge className="capitalize">{r.phase}</Badge>
                </td>
                <td className="px-4 py-3 text-right">{fmt(r.current)}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{deltaText(r.delta)?.text ?? "–"}</td>
                <td className="px-4 py-3 text-right sm:px-6">{pct(ratio(r.current, r.visitors))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Abuse counters (last 7 days vs the 7 before) and today's email quota per provider. Not tied to the range filter. */
export function HealthCard({ h }: { h: Health & { sample: boolean } }) {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Health</CardTitle>
        <CardDescription>Blocked requests in the last 7 days, and sign-in emails sent today (UTC) against each provider&apos;s free daily cap.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <dl className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-2 text-sm tabular-nums">
          {h.counters.map((c) => (
            <div key={c.name} className="contents">
              <dt className="text-muted-foreground">{c.label}</dt>
              <dd className="text-right font-medium">{fmt(c.current)}</dd>
              <dd className="text-right text-xs text-muted-foreground">{deltaText(delta(c.current, c.previous))?.text ?? "–"} vs previous</dd>
            </div>
          ))}
        </dl>
        <ul className="space-y-3 text-sm">
          {h.providers.map((p) => {
            const share = p.cap > 0 ? p.used / p.cap : 0;
            return (
              <li key={p.name}>
                <div className="flex justify-between gap-2">
                  <span className="capitalize">{p.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {p.configured ? `${fmt(p.used)} / ${fmt(p.cap)}` : "Not configured"}
                    {p.configured && share >= 0.8 && <span className="ml-2 font-medium text-foreground">Near cap</span>}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted">
                  <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${Math.min(100, share * 100)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
