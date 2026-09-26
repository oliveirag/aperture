"use client";

import { useEffect, useState } from "react";
import type { PriceResponse } from "@/app/api/price/route";
import type { SnapHolding } from "@/lib/price-holdings";

export type PracticeLeg = { ticker: string; dollars: number; name?: string };

export type PracticePrices =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; holdings: SnapHolding[]; missing: string[] }
  | { status: "error"; error: string };

const DEBOUNCE_MS = 350;

// Prices hypothetical dollars per ticker: /api/price turns each dollar amount into fractional shares at the live price.
// Tickers Finnhub can't price come back in `missing`.
export function usePracticePrices(legs: PracticeLeg[]): PracticePrices {
  // The last answer and the request it answers; anything else is still loading.
  const [result, setResult] = useState<{ key: string; state: PracticePrices } | null>(null);
  const key = JSON.stringify(legs);

  useEffect(() => {
    const list: PracticeLeg[] = JSON.parse(key);
    if (list.length === 0) return;
    const controller = new AbortController();
    const done = (state: PracticePrices) => setResult({ key, state });
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ holdings: list.map((l) => ({ ticker: l.ticker, marketValue: l.dollars, name: l.name })) }),
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => ({}))) as Partial<PriceResponse> & { error?: string };
        if (!res.ok || !Array.isArray(data.holdings)) {
          done({ status: "error", error: data.error ?? "Couldn't price these tickers." });
          return;
        }
        // A row without a live quote has no real share price, so it can't be practiced with.
        const holdings = data.holdings.filter((h) => h.status === "matched");
        const found = new Set(holdings.map((h) => h.ticker));
        done({ status: "ready", holdings, missing: list.map((l) => l.ticker).filter((t) => !found.has(t)) });
      } catch {
        if (!controller.signal.aborted) done({ status: "error", error: "Couldn't reach the server." });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key]);

  if (legs.length === 0) return { status: "idle" };
  if (result?.key !== key) return { status: "loading" };
  return result.state;
}
