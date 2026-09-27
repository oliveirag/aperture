"use client";

import { useState } from "react";
import { formatPct, formatUSD } from "@/lib/format";
import { usePolicy } from "@/lib/experience/store";
import type { XrayModel } from "@/lib/xray/types";
import { DetailCard } from "./card";

// Pure: companies two funds both hold, with the dollars each fund routes to you. From the model's exposure paths,
// so it covers exactly the companies the X-Ray lists.
export function sharedThrough(model: XrayModel, a: string, b: string) {
  const all = model.exposures?.length ? model.exposures : model.topTen;
  return all
    .map((e) => ({ ticker: e.ticker, name: e.name, a: e.sources.find((s) => s.via === a)?.value ?? 0, b: e.sources.find((s) => s.via === b)?.value ?? 0 }))
    .filter((r) => r.a > 0 && r.b > 0)
    .sort((x, y) => y.a + y.b - (x.a + x.b));
}

// Compare two of your funds side by side: how much they overlap and which companies both send you.
export function CompareFunds({ model }: { model: XrayModel }) {
  const policy = usePolicy();
  const pairs = model.overlaps;
  const [index, setIndex] = useState(0);
  if (pairs.length === 0) return null;
  const pair = pairs[Math.min(index, pairs.length - 1)];
  const rows = sharedThrough(model, pair.a, pair.b);
  const shown = rows.slice(0, policy.level === "advanced" ? 25 : 8);

  return (
    <DetailCard
      title="Compare funds"
      headline={`${pair.a} and ${pair.b} overlap ${formatPct(pair.overlap, 0)} by weight`}
      className="lg:col-span-12"
      action={
        pairs.length > 1 ? (
          <select
            aria-label="Fund pair"
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
            className="h-8 border border-border bg-surface-1 px-2 text-[13px] text-text"
          >
            {pairs.map((p, i) => (
              <option key={`${p.a}-${p.b}`} value={i}>
                {p.a} vs {p.b}
              </option>
            ))}
          </select>
        ) : null
      }
    >
      <p className="mt-2 text-[14px] text-text-muted">
        {pair.sharedCompanies} of {pair.b}&apos;s {pair.bCount} companies are also in {pair.a}. Below: the dollars each fund routes to the same
        companies.
      </p>
      {shown.length ? (
        <div className="-mx-2 mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-[14px]">
            <caption className="sr-only">Companies held by both {pair.a} and {pair.b}</caption>
            <thead>
              <tr className="border-b border-border text-[11px] tracking-[0.06em] text-text-muted uppercase">
                <th scope="col" className="h-8 px-2 text-left font-medium">Company</th>
                <th scope="col" className="h-8 px-2 text-right font-medium">Via {pair.a}</th>
                <th scope="col" className="h-8 px-2 text-right font-medium">Via {pair.b}</th>
                <th scope="col" className="h-8 px-2 text-right font-medium">Both, % of total</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.ticker} className="h-10 border-b border-border last:border-b-0">
                  <th scope="row" className="px-2 text-left font-normal text-text">{r.name}</th>
                  <td className="px-2 text-right tabular-nums text-text-muted">{formatUSD(r.a, policy.precision.usd)}</td>
                  <td className="px-2 text-right tabular-nums text-text-muted">{formatUSD(r.b, policy.precision.usd)}</td>
                  <td className="px-2 text-right tabular-nums text-text">{formatPct((r.a + r.b) / model.total, policy.precision.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > shown.length ? (
            <p className="mt-2 px-2 text-[12px] text-text-subtle">{rows.length - shown.length} more shared companies not shown.</p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-[14px] text-text-muted">None of the companies listed in this X-Ray reach you through both funds.</p>
      )}
    </DetailCard>
  );
}
