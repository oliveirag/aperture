"use client";

import { useId, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ShowMore } from "@/components/shared/disclosure";
import { TickerMark } from "@/components/shared/ticker-mark";
import { formatPct, formatUSD } from "@/lib/format";
import { useDisclosure } from "@/lib/experience/disclosure";
import { usePolicy } from "@/lib/experience/store";
import { cn } from "@/lib/utils";
import { COMPANY_THRESHOLD } from "@/lib/xray/compute";
import type { XExposure, XrayModel } from "@/lib/xray/types";
import { xrayView } from "@/lib/xray/view";
import { DetailCard } from "./card";

const TH = "h-8 px-2 text-[11px] font-medium tracking-[0.06em] text-text-muted uppercase";
// Long lists (a total-market fund has thousands of companies) render a page at a time.
const PAGE = 50;

function viaWeight(e: XExposure, via: string, total: number, digits: number) {
  const s = e.sources.find((x) => x.via === via);
  return s ? formatPct(s.value / total, digits) : "–";
}

// Every look-through company, largest first. The level sets how many rows start visible; "Show all" is always there.
export function TopTen({ model }: { model: XrayModel }) {
  const policy = usePolicy();
  const view = xrayView(model, policy);
  const { all, initial } = view.exposures;
  const [expanded, setExpanded] = useDisclosure("xray-exposures", "collapsed");
  const [pages, setPages] = useState(1);
  const tableId = useId();
  // The level sets how many rows are meant to be visible; very long lists still render a page at a time.
  const target = expanded ? all.length : initial;
  const limit = Math.min(target, Math.max(PAGE * pages, Math.min(initial, PAGE)));
  const exposures = all.slice(0, limit);
  const digits = policy.precision.pct;
  const weightOf = (v: number) => v / model.total;
  const maxWeight = all[0] ? weightOf(all[0].value) : 1;
  const vias = view.vias;
  const title = initial < 10 && !expanded ? `Your ${initial} biggest exposures` : "True Top 10 and beyond";

  return (
    <DetailCard title={title} headline="Your biggest companies, counted through your ETFs" className="lg:col-span-7">
      <div className="-mx-2 mt-4 overflow-x-auto">
        <table id={tableId} className="w-full min-w-[520px] border-collapse text-[14px]">
          <caption className="sr-only">
            Look-through exposures, {exposures.length} of {all.length} shown
          </caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className={cn(TH, "w-8 text-left")}>#</th>
              <th scope="col" className={cn(TH, "sticky left-0 bg-surface-1 text-left")}>Company</th>
              <th scope="col" className={cn(TH, "text-left")}>Look-through</th>
              {view.showViaColumns ? (
                vias.map((via) => (
                  <th key={via} scope="col" className={cn(TH, "text-right")}>
                    {via}
                  </th>
                ))
              ) : (
                <th scope="col" className={cn(TH, "text-left")}>Held via</th>
              )}
              <th scope="col" className={cn(TH, "text-right")}>Value</th>
            </tr>
          </thead>
          <tbody>
            {exposures.map((e, i) => {
              const w = weightOf(e.value);
              const flagged = w > COMPANY_THRESHOLD;
              return (
                <tr key={e.ticker} className="h-11 border-b border-border transition-colors duration-150 last:border-b-0 hover:bg-surface-2">
                  <td className="px-2 text-[12px] text-text-subtle tabular-nums">{i + 1}</td>
                  <th scope="row" className="sticky left-0 bg-surface-1 px-2 text-left font-normal">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <TickerMark ticker={e.ticker} color={e.color} size={24} />
                      <span className="truncate font-medium text-text">{e.name}</span>
                      {flagged ? <AlertTriangle aria-label="Above 10%" className="size-3.5 shrink-0 text-sev-medium" /> : null}
                    </div>
                  </th>
                  <td className="px-2">
                    <div className="flex items-center gap-2.5">
                      <span className="w-12 text-right font-medium text-text tabular-nums">{formatPct(w, digits)}</span>
                      <span aria-hidden className="h-1 w-20 overflow-hidden bg-surface-3">
                        <span
                          className="block h-full"
                          style={{ width: `${(w / maxWeight) * 100}%`, backgroundColor: flagged ? "var(--chart-1)" : "var(--chart-2)" }}
                        />
                      </span>
                    </div>
                  </td>
                  {view.showViaColumns ? (
                    vias.map((via) => (
                      <td key={via} className="px-2 text-right font-mono text-[12px] text-text-muted tabular-nums">
                        {viaWeight(e, via, model.total, digits)}
                      </td>
                    ))
                  ) : (
                    <td className="px-2">
                      <div className="flex gap-1">
                        {e.sources.map((s) => (
                          <span key={s.via} className="inline-flex h-5 items-center border border-border px-1.5 text-[11px] text-text-muted">
                            {s.via}
                          </span>
                        ))}
                      </div>
                    </td>
                  )}
                  <td className="px-2 text-right text-text-muted tabular-nums">{formatUSD(e.value, policy.precision.usd)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
        {all.length > initial ? (
          <ShowMore
            open={expanded}
            onToggle={() => {
              setExpanded(!expanded);
              setPages(1);
            }}
            more={`Show all ${all.length.toLocaleString("en-US")} companies`}
            less={`Show the first ${initial}`}
            controls={tableId}
          />
        ) : null}
        {limit < target ? (
          <button type="button" onClick={() => setPages((p) => p + 1)} className="text-[13px] font-medium text-text-muted hover:text-text">
            Show {Math.min(PAGE, target - limit)} more of {target.toLocaleString("en-US")}
          </button>
        ) : null}
        {!view.exposures.listedIsComplete ? (
          <p className="text-[12px] text-text-subtle">
            {model.mode === "demo" ? "The demo snapshot lists its ten largest companies; " : "Listed companies come from funds' published holdings; "}
            {model.underlyingCompanies.toLocaleString("en-US")} companies in total.
          </p>
        ) : null}
      </div>
    </DetailCard>
  );
}
