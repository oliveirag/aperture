"use client";

import { useEffect, useMemo } from "react";
import { formatPct, formatSignedUSD } from "@/lib/format";
import { diffVisits, positionsKey, useLastSeen } from "@/lib/experience/last-seen";
import { useLevelValue } from "@/lib/experience/store";
import { usePortfolio } from "@/lib/portfolio-store";
import type { XrayModel } from "@/lib/xray/types";
import { DetailCard } from "./card";

const pts = (d: number) => `${d > 0 ? "+" : "−"}${(Math.abs(d) * 100).toFixed(1)} pts`;

// Records this visit's top weights and flags for the active portfolio, whether or not the card is open.
export function useRecordVisit(model: XrayModel) {
  const imported = usePortfolio((s) => s.imported);
  const key = positionsKey(imported);
  const recordVisit = useLastSeen((s) => s.recordVisit);
  const visit = useMemo(() => {
    const all = model.exposures?.length ? model.exposures : model.topTen;
    const weights = Object.fromEntries(all.slice(0, 25).map((e) => [e.ticker, e.value / model.total]));
    return { at: new Date().toISOString(), total: model.total, weights, flags: model.flags.map((f) => f.label) };
  }, [model]);

  useEffect(() => {
    if (useLastSeen.persist.hasHydrated()) {
      recordVisit(key, visit);
      return;
    }
    return useLastSeen.persist.onFinishHydration(() => recordVisit(key, visit));
  }, [key, visit, recordVisit]);
}

// "Since your last visit": compares this browser session's view with the previous session's.
export function ChangesCard({ model }: { model: XrayModel }) {
  const imported = usePortfolio((s) => s.imported);
  const key = positionsKey(imported);
  const level = useLevelValue();
  const seen = useLastSeen((s) => s.portfolios[key]);
  const baseline = seen?.baseline;
  const names = new Map((model.exposures ?? model.topTen).map((e) => [e.ticker, e.name]));
  const diff = baseline && seen?.latest ? diffVisits(baseline, seen.latest) : null;
  const when = baseline ? new Date(baseline.at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
  const quiet = diff && diff.moved.length === 0 && diff.newFlags.length === 0 && diff.clearedFlags.length === 0;

  return (
    <DetailCard title="Since your last visit" headline={when ? `Compared with ${when}` : "We'll compare from your next visit"} className="lg:col-span-12">
      {!diff ? (
        <p className="mt-2 text-[14px] text-text-muted">
          This visit is saved on this device only. Next time you open this portfolio, weight changes and new concentration flags appear here.
        </p>
      ) : quiet ? (
        <p className="mt-2 text-[14px] text-text-muted">No exposure moved by half a point or more, and the concentration flags are the same.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3 text-[14px]">
          <p className="text-text-muted">
            Portfolio value {formatSignedUSD(diff.totalChange)} since then
            {model.mode === "demo" ? " (the demo snapshot doesn't change)" : ""}.
          </p>
          {diff.newFlags.length ? <p className="text-text">Newly above a concentration limit: {diff.newFlags.join(", ")}.</p> : null}
          {diff.clearedFlags.length ? <p className="text-text-muted">No longer above a limit: {diff.clearedFlags.join(", ")}.</p> : null}
          {diff.moved.length ? (
            <ul className="flex flex-col divide-y divide-border border-y border-border">
              {diff.moved.slice(0, level === "advanced" ? 25 : 5).map((c) => (
                <li key={c.ticker} className="flex h-9 items-center justify-between gap-4">
                  <span className="text-text">{names.get(c.ticker) ?? c.ticker}</span>
                  <span className="tabular-nums text-text-muted">
                    {formatPct(c.before)} → {formatPct(c.after)} <span className="text-text">({pts(c.after - c.before)})</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </DetailCard>
  );
}
