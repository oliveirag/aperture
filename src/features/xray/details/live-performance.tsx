"use client";

import { useEffect, useMemo } from "react";
import { LoaderCircle } from "lucide-react";
import { create } from "zustand";
import { TickerMark } from "@/components/shared/ticker-mark";
import { formatPct, formatSignedPct } from "@/lib/format";
import { MAX_POSITIONS, tooManyPositionsMessage } from "@/lib/limits";
import { useLiveHoldings } from "@/lib/market";
import type { PerformanceHolding, PerformanceResponse } from "@/lib/performance";
import { cn } from "@/lib/utils";
import { DetailCard } from "./card";
import { PerformanceChart } from "./performance-chart";

type Entry = { key: string; status: "loading" | "ready" | "error"; data: PerformanceResponse | null; error: string | null };

export function performancePositions(holdings: readonly PerformanceHolding[]): PerformanceHolding[] {
  return holdings.map(({ ticker, shares, price, kind, marketValue, provenance }) => ({ ticker, shares, price, kind, marketValue, provenance }));
}

// Keyed by the full shared valuation so refresh cannot reuse an old coverage denominator.
let requestVersion = 0;
let pendingRequest: AbortController | null = null;
const usePerformance = create<{ entry: Entry | null; load: (key: string, holdings: PerformanceHolding[], force?: boolean) => void }>()(
  (set, get) => ({
    entry: null,
    load: (key, holdings, force = false) => {
      if (get().entry?.key === key && (!force || get().entry?.status === "loading")) return;
      const version = ++requestVersion;
      pendingRequest?.abort();
      const controller = new AbortController();
      pendingRequest = controller;
      set({ entry: { key, status: "loading", data: null, error: null } });
      fetch("/api/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings }),
        signal: controller.signal,
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : typeof data?.error?.message === "string" ? data.error.message : `HTTP ${res.status}`);
          if (version === requestVersion && get().entry?.key === key) set({ entry: { key, status: "ready", data: data as PerformanceResponse, error: null } });
        })
        .catch((err: unknown) => {
          if (version === requestVersion && get().entry?.key === key) set({ entry: { key, status: "error", data: null, error: err instanceof Error ? err.message : "failed" } });
        });
    },
  }),
);

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <DetailCard title="Performance" className="lg:col-span-12">
      <div role="status" aria-live="polite" className="mt-5 flex min-h-[200px] items-center text-[15px] leading-6 text-text-muted">{children}</div>
    </DetailCard>
  );
}

// Performance for an imported or practice portfolio: weekly closes at today's share counts, ending at today's value.
export function LivePerformance() {
  const { holdings } = useLiveHoldings();
  const positions = useMemo(() => performancePositions(holdings), [holdings]);
  const key = useMemo(() => JSON.stringify(positions), [positions]);
  const entry = usePerformance((s) => s.entry);
  const load = usePerformance((s) => s.load);

  const tooMany = positions.length > MAX_POSITIONS;
  useEffect(() => {
    if (positions.length && !tooMany) load(key, positions);
  }, [key, positions, load, tooMany]);

  if (!positions.length) return <Empty>No positions are available, so there is no price history to chart.</Empty>;
  if (tooMany) return <Empty>{tooManyPositionsMessage(positions.length, "Performance")}</Empty>;
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
        <div>
          <p>{mine.status === "error"
            ? `Price history isn't available right now (${mine.error}).`
            : "No price history for these positions yet, so there's no chart to draw."}</p>
          {mine.status === "error" && <button type="button" className="mt-3 text-accent underline underline-offset-4" onClick={() => load(key, positions, true)}>Retry history</button>}
        </div>
      </Empty>
    );
  }

  const { data } = mine;
  // Keep each server observation paired with the value and source date used by the calculation.
  const series = data.series;
  return (
    <PerformanceChart series={series}>
      <span role="status" className="sr-only">Historical prices loaded.</span>
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
          Assumes you held today&apos;s share counts for the whole period; this is not account performance or verified total return.
          Observation dates and values are shown as returned by the history calculation.
          {data.excluded.length > 0
            ? ` Not included (unsupported/value-only/cash or no price history): ${data.excluded.join(", ")}, ${formatPct(1 - data.coverage)} of your money.`
            : ""}
        </p>
      </div>
    </PerformanceChart>
  );
}
