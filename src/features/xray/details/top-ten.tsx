"use client";

import { AlertTriangle } from "lucide-react";
import { TickerMark } from "@/components/shared/ticker-mark";
import { weightOf } from "@/data/portfolio";
import { COMPANY_THRESHOLD, EXPOSURES, exposureTotal } from "@/data/xray";
import { formatPct, formatUSD } from "@/lib/format";
import { useLevel } from "@/lib/level";
import { cn } from "@/lib/utils";
import type { Exposure, ExposureSource } from "@/types/demo";
import { DetailCard } from "./card";

const MAX_WEIGHT = weightOf(exposureTotal(EXPOSURES[0]));
const VIAS: ExposureSource["via"][] = ["Direct", "VOO", "QQQ"];
const TH = "h-8 px-2 text-[11px] font-medium tracking-[0.06em] text-text-muted uppercase";

function viaWeight(e: Exposure, via: ExposureSource["via"]) {
  const s = e.sources.find((x) => x.via === via);
  return s ? formatPct(weightOf(s.value)) : "–";
}

export function TopTen() {
  const advanced = useLevel((s) => s.level) === "advanced";

  return (
    <DetailCard title="True Top 10" headline="Your biggest companies, counted through your ETFs" className="lg:col-span-7">
      <div className="-mx-2 mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-border">
              <th className={cn(TH, "w-8 text-left")}>#</th>
              <th className={cn(TH, "text-left")}>Company</th>
              <th className={cn(TH, "text-left")}>Look-through</th>
              {advanced ? (
                <>
                  <th className={cn(TH, "text-right")}>Direct</th>
                  <th className={cn(TH, "text-right")}>VOO</th>
                  <th className={cn(TH, "text-right")}>QQQ</th>
                </>
              ) : (
                <th className={cn(TH, "text-left")}>Held via</th>
              )}
              <th className={cn(TH, "text-right")}>Value</th>
            </tr>
          </thead>
          <tbody>
            {EXPOSURES.map((e, i) => {
              const total = exposureTotal(e);
              const w = weightOf(total);
              const flagged = w > COMPANY_THRESHOLD;
              return (
                <tr
                  key={e.ticker}
                  className="h-11 border-b border-border transition-colors duration-150 last:border-b-0 hover:bg-surface-2"
                >
                  <td className="px-2 text-[12px] text-text-subtle tabular-nums">{i + 1}</td>
                  <td className="px-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <TickerMark ticker={e.ticker} color={e.color} size={24} />
                      <span className="truncate font-medium text-text">{e.name}</span>
                      {flagged ? <AlertTriangle aria-label="Above 10%" className="size-3.5 shrink-0 text-sev-medium" /> : null}
                    </div>
                  </td>
                  <td className="px-2">
                    <div className="flex items-center gap-2.5">
                      <span className="w-11 text-right font-medium text-text tabular-nums">{formatPct(w)}</span>
                      <span className="h-1 w-20 overflow-hidden bg-surface-3">
                        <span
                          className="block h-full"
                          style={{
                            width: `${(w / MAX_WEIGHT) * 100}%`,
                            backgroundColor: flagged ? "var(--chart-1)" : "var(--chart-2)",
                          }}
                        />
                      </span>
                    </div>
                  </td>
                  {advanced ? (
                    VIAS.map((via) => (
                      <td key={via} className="px-2 text-right font-mono text-[12px] text-text-muted tabular-nums">
                        {viaWeight(e, via)}
                      </td>
                    ))
                  ) : (
                    <td className="px-2">
                      <div className="flex gap-1">
                        {e.sources.map((s) => (
                          <span
                            key={s.via}
                            className="inline-flex h-5 items-center border border-border px-1.5 text-[11px] text-text-muted"
                          >
                            {s.via}
                          </span>
                        ))}
                      </div>
                    </td>
                  )}
                  <td className="px-2 text-right text-text-muted tabular-nums">{formatUSD(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </DetailCard>
  );
}
