"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { formatSignedPct, formatUSD } from "@/lib/format";
import { useLiveHoldings } from "@/lib/market";
import type { Outlook } from "@/lib/outlook";
import { DetailCard } from "./card";

const W = 560;
const H = 180;

function Fan({ o }: { o: Outlook }) {
  const closes = o.recent.map(p => p.close);
  const scale = o.price / closes[closes.length - 1]; // adjusted closes sit slightly below quotes; align the history to today's price
  const hist = closes.map(c => c * scale);
  const lo = o.price * (1 + o.low), hi = o.price * (1 + o.high), mid = o.price * (1 + o.median);
  const min = Math.min(...hist, lo), max = Math.max(...hist, hi);
  const total = hist.length + o.horizonWeeks;
  const x = (i: number) => (i / (total - 1)) * (W - 8) + 4;
  const y = (v: number) => H - 8 - ((v - min) / (max - min || 1)) * (H - 16);
  const last = hist.length - 1;
  const end = total - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${o.ticker} last year of weekly closes and the historical 10th to 90th percentile range for the next ${o.horizonWeeks} weeks`} className="mt-4 h-auto w-full">
      <polygon points={`${x(last)},${y(o.price)} ${x(end)},${y(hi)} ${x(end)},${y(lo)}`} className="fill-accent/15" />
      <polyline points={hist.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" className="stroke-text" strokeWidth="1.5" />
      <line x1={x(last)} y1={y(o.price)} x2={x(end)} y2={y(mid)} className="stroke-accent" strokeWidth="1.5" strokeDasharray="4 3" />
      <line x1={x(last)} y1={0} x2={x(last)} y2={H} className="stroke-border" />
    </svg>
  );
}

// A validated historical range for one holding. Deliberately not a price target.
export function HistoricalRange() {
  const { holdings } = useLiveHoldings();
  const stocks = holdings.filter(h => h.price > 0);
  const [ticker, setTicker] = useState("");
  const [state, setState] = useState<{ key: string; outlook?: Outlook; error?: string } | null>(null);
  const chosen = stocks.find(h => h.ticker === ticker) ?? stocks[0];
  const symbol = chosen?.ticker ?? "";
  const quote = chosen?.price ?? 0;
  const key = symbol;
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    fetch("/api/outlook", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ ticker: symbol, price: quote }) })
      .then(async r => { const d = await r.json(); setState(r.ok ? { key, outlook: d } : { key, error: d.error ?? "Unavailable" }); })
      .catch(e => { if (!controller.signal.aborted) setState({ key, error: e instanceof Error ? e.message : "Unavailable" }); });
    return () => controller.abort();
    // Keyed by symbol only: live quote ticks must not refetch (each fetch counts against the hourly limit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!chosen) return null;
  const mine = state?.key === key ? state : null;
  const o = mine?.outlook;
  return (
    <DetailCard title="Historical range" headline="What this stock's own history says about the next 3 months" className="lg:col-span-12"
      action={<select aria-label="Holding" value={chosen.ticker} onChange={e => setTicker(e.target.value)} className="h-8 border border-border bg-surface-1 px-2 text-[13px] text-text">{stocks.map(h => <option key={h.ticker}>{h.ticker}</option>)}</select>}>
      {!mine ? <p className="mt-5 flex items-center gap-3 text-[15px] text-text-muted"><LoaderCircle aria-hidden className="size-4 animate-spin text-accent" />Loading weekly history…</p>
        : !o ? <p className="mt-5 text-[15px] leading-6 text-text-muted">{mine.error}</p>
        : <>
          <div className="mt-4 grid grid-cols-3 gap-4 text-[14px]">
            {([["Low case (10th pct.)", o.low], ["Middle (median)", o.median], ["High case (90th pct.)", o.high]] as const).map(([label, r]) => (
              <div key={label}><p className="text-[11px] tracking-[0.04em] text-text-subtle uppercase">{label}</p><p className="text-[20px] tabular-nums text-text">{formatSignedPct(r)}</p><p className="tabular-nums text-text-muted">{formatUSD(o.price * (1 + r))}</p></div>
            ))}
          </div>
          <Fan o={o} />
          <p className="mt-4 text-[13px] leading-5 text-text-muted">
            Backtest: using only data available at the time, this method&apos;s 10th–90th range contained the actual next-{o.horizonWeeks}-week return {Math.round(o.backtest.insideShare * 100)}% of the time across {o.backtest.tests} non-overlapping tests (an ideal range is {Math.round(o.backtest.nominal * 100)}%).
            {o.backtest.insideShare < 0.7 ? " That is well under the ideal, so treat this range as too narrow." : ""}
          </p>
          <p className="mt-2 text-[12px] leading-5 text-text-subtle">
            Not a prediction or advice. It resamples {o.sampleWeeks} weeks of this stock&apos;s own past {o.horizonWeeks}-week returns (split- and dividend-adjusted weekly closes, Alpha Vantage). It cannot know about events, earnings or the scenarios in Shock Test.
          </p>
        </>}
    </DetailCard>
  );
}
