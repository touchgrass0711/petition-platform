"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fieldClass } from "@/components/ui/input";
import { adminApi } from "@/lib/admin-api";
import { percent } from "@/lib/format";
import { deltaText, ratio, seriesRows, type Row } from "@/lib/metrics/chart";
import { DEFAULT_RANGE, parseRange, RANGE_LABEL, RANGES, type Range } from "@/lib/metrics/range";
import type { Summary } from "@/lib/metrics/summary";
import { cn } from "@/lib/utils";
import { useAdminSession } from "../AdminGate";
import { HealthCard, Insights } from "./Insights";
import type { Health } from "@/lib/server/health";

const SignaturesChart = dynamic(() => import("./SignaturesChart"), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-lg bg-muted/50" />,
});

type Data = Summary & { sample: boolean; campaigns: { slug: string; title: string }[] };

const fmt = (n: number) => n.toLocaleString("en-US");
const RANGE_NAME: Record<Range, string> = {
  "24h": "Last 24 hours", "3d": "Last 3 days", "7d": "Last 7 days", "30d": "Last 30 days",
  "3m": "Last 3 months", "6m": "Last 6 months", "1y": "Last year", all: "All time",
};

/** Filter row + KPI tiles + signatures chart + pace card. Read-only, so Demo Mode shows it unchanged with sample data. */
export function Metrics() {
  const session = useAdminSession();
  const [campaign, setCampaign] = useState("all");
  const [range, setRange] = useState<Range>(DEFAULT_RANGE);
  const [cumulative, setCumulative] = useState(false);
  const [asTable, setAsTable] = useState(false);

  // Filters live in the URL so a view can be shared; read after mount to keep the page static.
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    setRange(parseRange(p.get("range")));
    setCampaign(p.get("campaign") ?? "all");
  }, []);
  function pick(next: { campaign?: string; range?: Range }) {
    const p = new URLSearchParams(location.search);
    if (next.range) {
      setRange(next.range);
      p.set("range", next.range);
    }
    if (next.campaign) {
      setCampaign(next.campaign);
      p.set("campaign", next.campaign);
    }
    history.replaceState(null, "", `?${p}`);
  }

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const q = useQuery({
    queryKey: ["admin-metrics", campaign, range],
    queryFn: () => adminApi<Data>(session, `/api/admin/metrics?campaign=${encodeURIComponent(campaign)}&range=${range}&tz=${encodeURIComponent(tz)}`),
    placeholderData: keepPreviousData,
  });
  const d = q.data;
  const health = useQuery({ queryKey: ["admin-health"], queryFn: () => adminApi<Health & { sample: boolean }>(session, "/api/admin/health") });
  const rows: Row[] = d ? seriesRows(d.signatures, d.starts, d.unit, d.timeZone, cumulative) : [];
  const v = d?.traffic.visitors;
  const conv = d && v ? ratio(d.signatures.current, v.current) : null;
  const prevConv = d && v?.previous != null && d.signatures.previous != null ? ratio(d.signatures.previous, v.previous) : null;

  return (
    <section aria-labelledby="metrics-title" className={cn("space-y-4 md:space-y-6 transition-opacity", q.isPlaceholderData && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="metrics-title" className="sr-only">Metrics</h2>
        {/* Single-campaign mode returns one campaign: nothing to pick. */}
        {(!d || d.campaigns.length > 1) && (
          <>
            <label className="sr-only" htmlFor="metrics-campaign">Campaign</label>
            <select
              id="metrics-campaign"
              className={cn(fieldClass, "h-9 w-auto max-w-64")}
              value={campaign}
              onChange={(e) => pick({ campaign: e.target.value })}
            >
              <option value="all">All campaigns</option>
              {d?.campaigns.map((c) => <option key={c.slug} value={c.slug}>{c.title}</option>)}
            </select>
          </>
        )}
        <div role="group" aria-label="Time range" className="flex overflow-x-auto rounded-md border p-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={r === range}
              aria-label={RANGE_NAME[r]}
              onClick={() => pick({ range: r })}
              className={cn("rounded px-2.5 py-1 text-sm font-medium", r === range ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
        {d?.sample && <Badge>Sample data</Badge>}
        {q.isError && <p className="text-sm text-destructive">Could not load metrics: {(q.error as Error).message}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 md:gap-6">
        <Tile label="Signatures" value={d?.signatures.current} delta={d && deltaText(d.signatures.delta)} />
        <Tile label="Unique visitors" value={v?.current} delta={v && deltaText(v.delta)} />
        <Tile
          label="Conversion"
          value={conv}
          display={conv === null ? "–" : `${conv.toFixed(1)}%`}
          delta={d && pointsDelta(conv, prevConv)}
          hint="Signatures ÷ visitors"
        />
        {d?.campaign ? (
          <Tile label="Progress to goal" value={d.campaign.signatureCount} display={`${d.campaign.goal > 0 ? Math.round((d.campaign.signatureCount / d.campaign.goal) * 100) : 0}%`} hint={`${fmt(d.campaign.signatureCount)} of ${fmt(d.campaign.goal)}`} />
        ) : (
          <Tile label="Live campaigns" value={d?.comparison.filter((c) => c.phase === "live").length} hint={d && `${d.comparison.length} published`} />
        )}
      </div>

      <div className={cn("grid gap-4 md:gap-6", d?.campaign && "xl:grid-cols-[1fr_320px]")}>
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Signatures over time</CardTitle>
              <CardDescription>
                {RANGE_NAME[range]}, per {d?.step && d.step > 1 ? `${d.step} ${d.unit}s` : (d?.unit ?? "bucket")} · {d?.timeZone}
                {d && !d.signatures.prev && " · no full previous period to compare"}
              </CardDescription>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" aria-pressed={cumulative} onClick={() => setCumulative(!cumulative)}>
                {cumulative ? "Per period" : "Cumulative"}
              </Button>
              <Button size="sm" variant="ghost" aria-pressed={asTable} onClick={() => setAsTable(!asTable)}>
                {asTable ? "View as chart" : "View as table"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!d ? (
              <div className="h-64 animate-pulse rounded-lg bg-muted/50" />
            ) : asTable ? (
              <RowsTable rows={rows} />
            ) : (
              <SignaturesChart rows={rows} cumulative={cumulative} goal={d.campaign?.goal} milestones={d.campaign?.milestones} />
            )}
          </CardContent>
        </Card>
        {d?.campaign && <PaceCard c={d.campaign} />}
      </div>
      {d && <Insights d={d} onPick={(slug) => pick({ campaign: slug })} />}
      {health.data && <HealthCard h={health.data} />}
    </section>
  );
}

type Shown = ReturnType<typeof deltaText>;

// A rate changes in percentage points; a percent of a percent reads wrong.
function pointsDelta(cur: number | null, prev: number | null): Shown {
  if (cur === null || prev === null) return null;
  const pts = Math.round((cur - prev) * 10) / 10;
  return pts === 0 ? { text: "No change", dir: "flat" } : { text: `${pts > 0 ? "+" : "−"}${Math.abs(pts).toFixed(1)} pts`, dir: pts > 0 ? "up" : "down" };
}

function DeltaBadge({ d }: { d: Shown }) {
  if (!d) return <span className="text-xs text-muted-foreground">No previous period</span>;
  const Icon = d.dir === "up" ? ArrowUpRight : d.dir === "down" ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", d.dir === "up" && "text-emerald-600 dark:text-emerald-400", d.dir === "down" && "text-red-600 dark:text-red-400", d.dir === "flat" && "text-muted-foreground")}>
      <Icon className="size-3.5" aria-hidden />
      {d.text}
      <span className="font-normal text-muted-foreground">&nbsp;vs previous</span>
    </span>
  );
}

function Tile({ label, value, display, delta: dl, hint }: { label: string; value?: number | null; display?: string; delta?: Shown; hint?: string | null }) {
  return (
    <div className="rounded-2xl border bg-card p-5 md:p-6">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{value === undefined ? "…" : (display ?? fmt(value ?? 0))}</p>
      <div className="mt-2 min-h-4">
        {dl !== undefined ? <DeltaBadge d={dl} /> : hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

function PaceCard({ c }: { c: NonNullable<Summary["campaign"]> }) {
  const pct = Math.min(100, percent(c.signatureCount, c.goal));
  const { avgPerDay, neededPerDay, projectedAt } = c.pace;
  const reached = c.signatureCount >= c.goal;
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Pace</CardTitle>
        <CardDescription>{c.title}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div role="meter" aria-valuemin={0} aria-valuemax={c.goal} aria-valuenow={c.signatureCount} aria-label="Signatures toward goal">
          <div className="flex justify-between tabular-nums">
            <span className="font-medium">{fmt(c.signatureCount)}</span>
            <span className="text-muted-foreground">goal {fmt(c.goal)}</span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-muted">
            <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 tabular-nums">
          <dt className="text-muted-foreground">Averaging (last 7 days)</dt>
          <dd className="text-right font-medium">{fmt(Math.round(avgPerDay))}/day</dd>
          {reached ? (
            <><dt className="text-muted-foreground">Goal</dt><dd className="text-right font-medium">Achieved</dd></>
          ) : neededPerDay !== null ? (
            <><dt className="text-muted-foreground">Needed to reach goal by end</dt><dd className="text-right font-medium">{fmt(Math.ceil(neededPerDay))}/day</dd></>
          ) : null}
          {!reached && !c.endAt && (
            <><dt className="text-muted-foreground">Projected goal date</dt><dd className="text-right font-medium">{projectedAt ? format(projectedAt, "d MMM yyyy") : "–"}</dd></>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

function RowsTable({ rows }: { rows: Row[] }) {
  const prev = rows.some((r) => r.previous !== null);
  return (
    <div className="max-h-64 overflow-auto">
      <table className="w-full text-sm tabular-nums">
        <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground uppercase">
          <tr>
            <th className="py-2 font-medium">Period</th>
            <th className="py-2 text-right font-medium">Signatures</th>
            {prev && <th className="py-2 text-right font-medium">Previous</th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.t}>
              <td className="py-1.5">{r.label}</td>
              <td className="py-1.5 text-right">{fmt(r.current)}</td>
              {prev && <td className="py-1.5 text-right text-muted-foreground">{r.previous === null ? "–" : fmt(r.previous)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
