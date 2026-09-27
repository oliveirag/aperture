"use client";

import { useEffect, useMemo } from "react";
import { LoaderCircle } from "lucide-react";
import { create } from "zustand";
import { TickerMark } from "@/components/shared/ticker-mark";
import { formatPct, formatSignedPct } from "@/lib/format";
import { useLiveHoldings } from "@/lib/market";
import type { PerformanceHolding, PerformanceResponse } from "@/lib/performance";
import { positionValue } from "@/lib/xray/valuation";
import { cn } from "@/lib/utils";
import { DetailCard } from "./card";
import { PerformanceChart } from "./performance-chart";

type Entry = { key: string; status: "loading" | "ready" | "error"; data: PerformanceResponse | null; error: string | null };

export function performancePositions(holdings: readonly PerformanceHolding[]): PerformanceHolding[] {
  return holdings.map(({ ticker, shares, price, kind, marketValue }) => ({ ticker, shares, price, kind, marketValue }));
}

// Keyed by the full shared valuation so refresh cannot reuse an old coverage denominator.
const usePerformance = create<{ entry: Entry | null; load: (key: string, holdings: PerformanceHolding[]) => void }>()(
  (set, get) => ({
    entry: null,
    load: (key, holdings) => {
      if (get().entry?.key === key && get().entry?.status !== "error") return;
      set({ entry: { key, status: "loading", data: null, error: null } });
      fetch("/api/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
          if (get().entry?.key === key) set({ entry: { key, status: "ready", data: data as PerformanceResponse, error: null } });
        })
        .catch((err: unknown) => {
          if (get().entry?.key === key) set({ entry: { key, status: "error", data: null, error: err instanceof Error ? err.message : "failed" } });
        });
    },
  }),
);

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <DetailCard title="Performance" className="lg:col-span-12">
      <div className="mt-5 flex min-h-[200px] items-center text-[15px] leading-6 text-text-muted">{children}</div>
    </DetailCard>
  );
}

// Performance for an imported or practice portfolio: weekly closes at today's share counts, ending at today's value.
export function LivePerformance() {
  const { holdings } = useLiveHoldings();
  const positions = useMemo(() => performancePositions(holdings), [holdings]);
  const key = JSON.stringify(positions);
  const entry = usePerformance((s) => s.entry);
  const load = usePerformance((s) => s.load);

  useEffect(() => {
    if (positions.length) load(key, positions);
  }, [key, positions, load]);

  const mine = entry?.key === key ? entry : null;
  if (!mine || mine.status === "loading") {
    return (
      <Empty>
        <span className="flex items-center gap-3">
          <LoaderCircle aria-hidden className="size-4 animate-spin text-accent" />
          Loading a year of weekly prices…
        </span>
      </Empty>
    );
  }
  if (mine.status === "error" || !mine.data || mine.data.series.length < 2) {
    return (
      <Empty>
        {mine.status === "error"
          ? `Price history isn't available right now (${mine.error}).`
          : "No price history for these positions yet, so there's no chart to draw."}
      </Empty>
    );
  }

  const { data } = mine;
  // The last point follows live quotes as they arrive, so the chart ends at the portfolio's value right now.
  const included = new Set(data.holdings.map((h) => h.ticker));
  const now = positions.filter((p) => included.has(p.ticker)).reduce((s, p) => s + positionValue(p), 0);
  const series = [...data.series.slice(0, -1), { ...data.series[data.series.length - 1], value: Math.round(now) }];
  return (
    <PerformanceChart series={series}>
      <div className="mt-6 flex flex-col gap-4 border-t border-border pt-5">
        <table className="w-full text-[13px]">
          <caption className="sr-only">Returns by holding</caption>
          <thead>
            <tr className="text-[11px] tracking-[0.04em] text-text-subtle uppercase">
              <th scope="col" className="pb-2 text-left font-medium">
                Holding
              </th>
              {(["1M", "6M", "1Y"] as const).map((r) => (
                <th key={r} scope="col" className="pb-2 text-right font-medium">
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.holdings.map((h) => (
              <tr key={h.ticker} className="border-t border-border">
                <th scope="row" className="py-2 text-left font-normal">
                  <span className="flex items-center gap-2 text-text">
                    <TickerMark ticker={h.ticker} size={24} />
                    {h.ticker}
                  </span>
                </th>
                {(["1M", "6M", "1Y"] as const).map((r) => {
                  const v = h.returns[r];
                  return (
                    <td key={r} className={cn("py-2 text-right tabular-nums", v === undefined ? "text-text-subtle" : v >= 0 ? "text-positive" : "text-negative")}>
                      {v === undefined ? "–" : formatSignedPct(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[12px] leading-5 text-text-subtle">
          Assumes you held today&apos;s share counts for the whole period. Weekly closes adjusted for splits and dividends (Alpha Vantage);
          the last point is today&apos;s price.
          {data.excluded.length > 0
            ? ` Not included (unsupported/value-only/cash or no price history): ${data.excluded.join(", ")}, ${formatPct(1 - data.coverage)} of your money.`
            : ""}
        </p>
      </div>
    </PerformanceChart>
  );
}
