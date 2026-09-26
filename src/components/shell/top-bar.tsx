"use client";

import { useEffect, useState } from "react";
import { AS_OF, DAY_CHANGE, PORTFOLIO_TOTAL } from "@/data/portfolio";
import { formatSignedPct, formatSignedUSD, formatUSD } from "@/lib/format";
import { latestQuoteTime, useLiveHoldings, useMarket } from "@/lib/market";
import { useHydratePortfolio } from "@/lib/portfolio-store";
import { cn } from "@/lib/utils";
import { LevelSwitcher } from "./level-switcher";

const REFRESH_MS = 60 * 1000;

function quoteTimeLabel(unix: number) {
  return new Date(unix * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
}

// Live total from Finnhub quotes; snapshot (demo) or import-time (imported) prices until they arrive or when Finnhub is unreachable.
function usePortfolioValue() {
  useHydratePortfolio();
  const quotes = useMarket((s) => s.quotes);
  const refreshQuotes = useMarket((s) => s.refreshQuotes);
  const { live, imported, holdings, total, dayChange, dayChangePct } = useLiveHoldings();
  const tickers = holdings.map((h) => h.ticker).join(",");

  useEffect(() => {
    const list = tickers.split(",");
    refreshQuotes(list);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refreshQuotes(list);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [tickers, refreshQuotes]);

  const label = imported ? "Imported portfolio" : "Demo portfolio";
  if (live) {
    return { label, live, total, change: dayChange, pct: dayChangePct, asOf: `Finnhub · ${quoteTimeLabel(latestQuoteTime(quotes))}` };
  }
  if (imported) return { label, live, total, change: 0, pct: 0, asOf: "Prices at import" };
  return { label, live, total: PORTFOLIO_TOTAL, change: DAY_CHANGE.value, pct: DAY_CHANGE.pct, asOf: `Snapshot ${AS_OF}` };
}

// Translucent layer that content scrolls under. The divider only appears once content is actually beneath it.
export function TopBar() {
  const [scrolled, setScrolled] = useState(false);
  const value = usePortfolioValue();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "material-glass sticky top-0 z-30 h-14 border-b bg-bg/80 backdrop-blur-xl backdrop-saturate-150 transition-[border-color] duration-200",
        scrolled ? "border-border" : "border-transparent",
      )}
    >
      <div className="mx-auto flex h-full max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <span className="hidden rounded-md border border-border-strong px-2 py-0.5 text-[11px] font-medium text-text-muted sm:inline-flex">
            {value.label}
          </span>
          <div className="flex items-baseline gap-2 whitespace-nowrap" title={value.asOf}>
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-text tabular-nums">{formatUSD(value.total)}</span>
            <span
              className={cn(
                "hidden text-[13px] tabular-nums sm:inline",
                value.change < 0 ? "text-negative" : "text-positive",
              )}
            >
              {formatSignedUSD(value.change)} ({formatSignedPct(value.pct, 2)})
            </span>
            {value.live ? (
              <span className="hidden items-center gap-1.5 self-center text-[11px] font-medium text-text-muted md:inline-flex">
                <span aria-hidden className="size-1.5 rounded-full bg-positive" />
                Live
              </span>
            ) : null}
          </div>
        </div>
        <LevelSwitcher />
      </div>
    </header>
  );
}
