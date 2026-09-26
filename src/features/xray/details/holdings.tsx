"use client";

import { TickerMark } from "@/components/shared/ticker-mark";
import { AS_OF } from "@/data/portfolio";
import { formatPct, formatSignedPct, formatUSD } from "@/lib/format";
import { useLiveHoldings, useMarket } from "@/lib/market";
import { cn } from "@/lib/utils";
import { DetailCard } from "./card";

const TH = "h-8 px-2 text-[11px] font-medium tracking-[0.06em] text-text-muted uppercase";

function SourceStatus({ live, imported }: { live: boolean; imported: boolean }) {
  return (
    <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 text-[12px] font-medium whitespace-nowrap text-text-muted">
      <span aria-hidden className={cn("size-1.5 rounded-full", live ? "bg-positive" : "bg-text-subtle")} />
      {live ? "Live · Finnhub" : imported ? "Prices at import" : `Snapshot · ${AS_OF}`}
    </span>
  );
}

// What the user bought, repriced with live quotes. Industry comes from the Finnhub company profile when there is one.
export function Holdings() {
  const { live, imported, holdings, total } = useLiveHoldings();
  const profiles = useMarket((s) => s.profiles);

  return (
    <DetailCard
      title="Holdings"
      headline={`${holdings.length} positions ${imported ? "from your screenshot" : "you bought"}`}
      action={<SourceStatus live={live} imported={imported} />}
      className="lg:col-span-12"
    >
      <div className="-mx-2 mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-border">
              <th className={cn(TH, "text-left")}>Holding</th>
              <th className={cn(TH, "text-left")}>Industry</th>
              <th className={cn(TH, "text-right")}>Shares</th>
              <th className={cn(TH, "text-right")}>Price</th>
              <th className={cn(TH, "text-right")}>Today</th>
              <th className={cn(TH, "text-right")}>Value</th>
              <th className={cn(TH, "text-right")}>Weight</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const profile = profiles[h.ticker];
              return (
                <tr
                  key={h.ticker}
                  className="h-11 border-b border-border transition-colors duration-150 last:border-b-0 hover:bg-surface-2"
                >
                  <td className="px-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <TickerMark ticker={h.ticker} color={h.color} size={24} />
                      <span className="w-12 font-medium text-text">{h.ticker}</span>
                      <span className="truncate text-text-muted">{profile?.name ?? h.name}</span>
                    </div>
                  </td>
                  <td className="px-2 text-text-muted">{profile?.industry || h.category || "–"}</td>
                  <td className="px-2 text-right text-text-muted tabular-nums">{h.shares.toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
                  <td className="px-2 text-right text-text tabular-nums">{formatUSD(h.price, 2)}</td>
                  <td
                    className={cn(
                      "px-2 text-right tabular-nums",
                      !h.live ? "text-text-subtle" : h.changePct < 0 ? "text-negative" : "text-positive",
                    )}
                  >
                    {h.live ? formatSignedPct(h.changePct, 2) : "–"}
                  </td>
                  <td className="px-2 text-right font-medium text-text tabular-nums">{formatUSD(h.value)}</td>
                  <td className="px-2 text-right text-text-muted tabular-nums">{total ? formatPct(h.value / total) : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </DetailCard>
  );
}
