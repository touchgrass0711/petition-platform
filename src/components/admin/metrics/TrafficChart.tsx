"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

// Loaded with next/dynamic from Metrics.tsx. Visitors and sessions share one count axis; rates live in tiles, never a second axis.

const config = {
  visitors: { label: "Visitors", color: "var(--chart-1)" },
  sessions: { label: "Sessions", color: "var(--chart-2)" },
} satisfies ChartConfig;

export type TrafficRow = { label: string; visitors: number; sessions: number };

export default function TrafficChart({ rows }: { rows: TrafficRow[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <LineChart data={rows} margin={{ left: 4, right: 12, top: 8 }} accessibilityLayer>
        <CartesianGrid vertical={false} strokeOpacity={0.5} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} />
        <YAxis tickLine={false} axisLine={false} width={48} allowDecimals={false} tickFormatter={(v: number) => v.toLocaleString("en-US")} />
        <ChartTooltip cursor content={<ChartTooltipContent indicator="line" />} />
        <Line dataKey="visitors" type="monotone" stroke="var(--color-visitors)" strokeWidth={2} dot={false} />
        <Line dataKey="sessions" type="monotone" stroke="var(--color-sessions)" strokeWidth={2} dot={false} />
        <ChartLegend content={<ChartLegendContent />} />
      </LineChart>
    </ChartContainer>
  );
}
