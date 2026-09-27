"use client";

import { useState, type ReactNode } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { formatSignedPct, formatUSD } from "@/lib/format";
import { RANGES, seriesReturn, type RangeId } from "@/lib/performance";
import type { PerformancePoint } from "@/types/demo";
import { DetailCard } from "./card";

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

// Headroom above and below the line: about 1% of the range's top value.
function pad(points: PerformancePoint[]) {
  return Math.max(1, Math.max(...points.map((p) => p.value)) * 0.01);
}

function axisLabel(v: number) {
  return v >= 10000 ? `$${Math.round(v / 1000)}k` : v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`;
}

// 4 evenly spaced ticks, first and last included.
function ticksFor(dates: string[]) {
  const n = dates.length - 1;
  return [0, 1, 2, 3].map((k) => dates[Math.round((n * k) / 3)]);
}

function ChartTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as { date: string; value: number };
  return (
    <div className="rounded-lg border border-border-strong bg-surface-2 px-3 py-2 shadow-lg">
      <p className="text-[12px] text-text-muted">{fmt(p.date, { month: "short", day: "numeric", year: "numeric" })}</p>
      <p className="text-[14px] font-medium text-text tabular-nums">{formatUSD(p.value)}</p>
    </div>
  );
}

// Weekly portfolio value with a 1M / 6M / 1Y switch. `children` renders under the chart (per-holding returns, notes).
export function PerformanceChart({ series, children }: { series: PerformancePoint[]; children?: ReactNode }) {
  const [range, setRange] = useState<RangeId>("1Y");
  const weeks = RANGES.find((r) => r.id === range)!.weeks;
  const data = series.slice(-(weeks + 1));
  const ret = seriesReturn(series, weeks) ?? 0;
  const current = series[series.length - 1].value;
  const tickOpts: Intl.DateTimeFormatOptions = weeks === 4 ? { month: "short", day: "numeric" } : { month: "short" };

  return (
    <DetailCard
      title="Performance"
      headline={
        <span className="flex items-baseline gap-2.5">
          <span className="tabular-nums">{formatUSD(current)}</span>
          <span className={`text-[14px] font-medium tabular-nums ${ret >= 0 ? "text-positive" : "text-negative"}`}>
            {formatSignedPct(ret)}
          </span>
          <span className="text-[13px] font-normal text-text-subtle">past {range}</span>
        </span>
      }
      action={
        <Tabs.Root value={range} onValueChange={(v) => setRange(v as RangeId)}>
          <Tabs.List
            aria-label="Performance range"
            className="relative flex h-7 items-center gap-0.5 bg-surface-1 p-0.5"
          >
            {RANGES.map((r) => (
              <Tabs.Tab
                key={r.id}
                value={r.id}
                className="relative z-10 h-full rounded-md px-2.5 text-[12px] font-medium text-text-muted transition-colors duration-150 ease-out outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-ring/50 data-active:text-text"
              >
                {r.id}
              </Tabs.Tab>
            ))}
            <Tabs.Indicator className="absolute top-1/2 left-0 h-[var(--active-tab-height)] w-[var(--active-tab-width)] translate-x-[var(--active-tab-left)] -translate-y-1/2 rounded-md bg-surface-3 shadow-[inset_0_0_0_1px_var(--border)] transition-[translate,width] duration-200 ease-out" />
          </Tabs.List>
        </Tabs.Root>
      }
      className="lg:col-span-12"
    >
      <div className="mt-4 h-[240px]">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 240 }}>
          <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="perf-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: "var(--chart-1)", stopOpacity: 0.18 }} />
                <stop offset="100%" style={{ stopColor: "var(--chart-1)", stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="date"
              ticks={ticksFor(data.map((d) => d.date))}
              tickFormatter={(d: string) => fmt(d, tickOpts)}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--text-subtle)", fontSize: 11 }}
              tickMargin={8}
              interval={0}
              padding={{ left: 8, right: 8 }}
            />
            <YAxis
              domain={[(min: number) => min - pad(data), (max: number) => max + pad(data)]}
              tickCount={4}
              tickFormatter={axisLabel}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--text-subtle)", fontSize: 11 }}
              width={44}
            />
            <Tooltip content={ChartTooltip} cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }} isAnimationActive={false} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--chart-1)"
              strokeWidth={1.5}
              fill="url(#perf-fill)"
              activeDot={{ r: 4, fill: "var(--chart-1)", stroke: "var(--bg)", strokeWidth: 2 }}
              animationDuration={400}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {children}
    </DetailCard>
  );
}
