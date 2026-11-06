"use client";

import { Area, AreaChart, CartesianGrid, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { Milestone } from "@/lib/campaign";
import type { Row } from "@/lib/metrics/chart";

// Loaded with next/dynamic from Metrics.tsx so Recharts stays out of every other bundle.

const config = {
  current: { label: "This period", color: "var(--chart-1)" },
  previous: { label: "Previous period", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

type Props = { rows: Row[]; cumulative: boolean; goal?: number; milestones?: Milestone[] };

export default function SignaturesChart({ rows, cumulative, goal, milestones = [] }: Props) {
  const hasPrev = rows.some((r) => r.previous !== null);
  const top = Math.max(0, ...rows.map((r) => r.current));
  const bottom = rows[0]?.current ?? 0;
  // Lines inside the drawn range only (or a far-off goal flattens the curve), and spaced apart so labels never pile up.
  const gap = (top - bottom) * 0.08;
  const refs: Milestone[] = [];
  if (cumulative) {
    for (const m of milestones.filter((m) => m.count > bottom && m.count <= top && (!goal || m.count < goal - gap)))
      if (!refs.length || m.count - refs[refs.length - 1].count >= gap) refs.push(m);
    if (goal && goal > bottom && goal <= top * 1.3) refs.push({ count: goal, label: "Goal" });
  }

  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <AreaChart data={rows} margin={{ left: 4, right: 12, top: 8 }} accessibilityLayer>
        <defs>
          <linearGradient id="sigFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-current)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--color-current)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeOpacity={0.5} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} />
        <YAxis tickLine={false} axisLine={false} width={48} allowDecimals={false} tickFormatter={(v: number) => v.toLocaleString("en-US")} domain={cumulative ? ["dataMin", "auto"] : [0, "auto"]} />
        <ChartTooltip cursor content={<ChartTooltipContent indicator="line" />} />
        {refs.map((m) => (
          <ReferenceLine
            key={`${m.label}-${m.count}`}
            y={m.count}
            stroke="var(--muted-foreground)"
            strokeDasharray="2 4"
            label={{ value: `${m.label} · ${m.count.toLocaleString("en-US")}`, position: "insideTopLeft", fontSize: 11, fill: "var(--muted-foreground)" }}
          />
        ))}
        <Area dataKey="current" type="monotone" stroke="var(--color-current)" strokeWidth={2} fill="url(#sigFill)" />
        {hasPrev && <Line dataKey="previous" type="monotone" stroke="var(--color-previous)" strokeWidth={2} strokeDasharray="5 5" dot={false} />}
        {hasPrev && <ChartLegend content={<ChartLegendContent />} />}
      </AreaChart>
    </ChartContainer>
  );
}
