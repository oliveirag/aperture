"use client";

import type { Snapshot } from "@/lib/imports/types";
import { mergeInputs } from "@/lib/imports/types";
import { formatUSD } from "@/lib/format";

export function SnapshotHistory({ snapshots, busy, onOpen, onRefresh }: {
  snapshots: Snapshot[];
  busy: boolean;
  onOpen: (snapshot: Snapshot) => void;
  onRefresh: (snapshot: Snapshot) => void;
}) {
  return <section className="space-y-4">
    <h2 className="text-xl">Portfolio snapshots</h2>
    {snapshots.length === 0 && <p>No completed snapshots yet. Your analysis will appear here after all required information is resolved.</p>}
    {snapshots.map(snapshot => {
      const versions = snapshots.filter(s => s.portfolio_id === snapshot.portfolio_id);
      const index = versions.findIndex(s => s.id === snapshot.id);
      const previous = versions[index + 1];
      const previousPositions = new Map(previous ? mergeInputs(previous.results).map(p => [p.ticker, p]) : []);
      const times = snapshot.results.flatMap(r => r.valuation ? [r.valuation.asOf] : []).sort();
      return <article key={snapshot.id} className="rounded border border-border-strong p-4 space-y-3">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h3 className="font-medium">{index === 0 ? "Current version" : "Historical snapshot"} · {new Date(snapshot.created_at).toLocaleString()}</h3>
            <p>{formatUSD(snapshot.model.total)}{previous && ` · ${formatUSD(snapshot.model.total - previous.model.total)} change since previous snapshot`}</p>
          </div>
          <div className="flex gap-3">
            <button className="underline" onClick={() => onOpen(snapshot)}>View X-Ray</button>
            <button className="underline disabled:opacity-50" disabled={busy} onClick={() => onRefresh(snapshot)}>Update analysis</button>
          </div>
        </div>
        <p className="text-sm text-text-muted">Valuation dates: {times[0] ?? "Not available"} to {times.at(-1) ?? "Not available"}. Different holdings may have different effective dates.</p>
        <details>
          <summary className="cursor-pointer">Holding values and changes</summary>
          <div className="overflow-auto"><table className="w-full text-sm">
            <thead><tr><th className="text-left">Holding</th><th>Current value</th><th>Previous value</th><th>Change</th></tr></thead>
            <tbody>{mergeInputs(snapshot.results).map(p => {
              const old = previousPositions.get(p.ticker);
              const value = p.shares * p.price;
              const before = old ? old.shares * old.price : null;
              return <tr key={p.ticker} className="border-t border-border"><td className="py-2">{p.ticker}</td><td className="text-center">{formatUSD(value)}</td><td className="text-center">{before === null ? "—" : formatUSD(before)}</td><td className="text-center">{before === null ? "—" : formatUSD(value - before)}</td></tr>;
            })}</tbody>
          </table></div>
        </details>
        <details>
          <summary className="cursor-pointer">Sources and timestamps</summary>
          {snapshot.results.map((result, i) => <p key={i} className="py-1 text-sm">
            {snapshot.rows[i]?.ticker || snapshot.rows[i]?.name}: {result.valuation ? `${result.valuation.source} · effective ${result.valuation.asOf} · retrieved/confirmed ${result.valuation.retrievedAt}` : "Explicitly excluded during review"}
            {result.input?.etf && ` · constituent data as of ${result.input.etf.asOf}`}
            {result.warnings?.length ? ` · ${result.warnings.join(" ")}` : ""}
          </p>)}
        </details>
      </article>;
    })}
  </section>;
}
