"use client";

import { useEffect } from "react";
import { AS_OF, DAY_CHANGE, PORTFOLIO_TOTAL } from "@/data/portfolio";
import { latestQuoteTime, useLiveHoldings, useMarket } from "@/lib/market";
import { useHydratePortfolio, usePortfolio } from "@/lib/portfolio-store";

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

// Live total from Finnhub quotes, refreshed every minute while the tab is visible. Falls back to snapshot (demo)
// or import-time (imported) prices until quotes arrive or when Finnhub is unreachable.
export function usePortfolioValue() {
  useHydratePortfolio();
  const quotes = useMarket((s) => s.quotes);
  const refreshQuotes = useMarket((s) => s.refreshQuotes);
  const { live, imported, holdings, total, dayChange, dayChangePct } = useLiveHoldings();
  const kind = usePortfolio((s) => s.kind);
  const tickers = holdings.map((h) => h.ticker).join(",");

  useEffect(() => {
    const list = tickers.split(",");
    refreshQuotes(list);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refreshQuotes(list);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [tickers, refreshQuotes]);

  const label = !imported ? "Demo portfolio" : kind === "practice" ? "Practice · no real money" : "Imported portfolio";
  if (live) {
    return { label, live, total, change: dayChange, pct: dayChangePct, asOf: `Finnhub · ${quoteTimeLabel(latestQuoteTime(quotes))}` };
  }
  if (imported) return { label, live, total, change: 0, pct: 0, asOf: "Prices at import" };
  return { label, live, total: PORTFOLIO_TOTAL, change: DAY_CHANGE.value, pct: DAY_CHANGE.pct, asOf: `Snapshot ${AS_OF}` };
}
