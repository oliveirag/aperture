"use client";

import { AlertTriangle, ArrowRight, Info } from "lucide-react";
import { SectionControls } from "@/components/shared/disclosure";
import { PageHeader } from "@/components/shared/page-header";
import { Term } from "@/components/shared/term";
import { formatPct, formatUSD } from "@/lib/format";
import { useLevelValue } from "@/lib/experience/store";
import { AS_OF } from "@/data/portfolio";
import { usePortfolio } from "@/lib/portfolio-store";
import type { XrayModel } from "@/lib/xray/types";
import { xrayMaterial } from "@/lib/xray/view";
import { FlagsStrip } from "./flags-strip";
import { ApertureMap } from "./aperture-map";

function HeaderStats({ model }: { model: XrayModel }) {
  const total = model.total;
  return (
    <div className="flex flex-wrap gap-x-12 gap-y-6">
      <div>
        {/* The demo's exposure math uses dated snapshot prices; the header total reprices live, so name the date here. */}
        <p className="text-[14px] font-normal text-text">{model.mode === "demo" ? `Value at ${AS_OF} snapshot` : "Portfolio value"}</p>
        <p className="display mt-1 text-[28px] leading-none text-text tabular-nums sm:text-[36px]">{formatUSD(total)}</p>
      </div>
      <div>
        <p className="text-[14px] font-normal text-text">Look-through</p>
        <p className="display mt-1 flex items-center gap-3 text-[28px] leading-none text-text tabular-nums sm:text-[36px]">
          {model.positionsCount} {model.positionsCount === 1 ? "position" : "positions"}
          <ArrowRight aria-hidden className="size-4 text-text-muted" />
          {model.underlyingCompanies.toLocaleString("en-US")} companies
        </p>
      </div>
    </div>
  );
}

function Explanation({ demo }: { demo: boolean }) {
  return (
    <p>
      An <Term term="ETF">ETF</Term> is a basket of many companies.{" "}
      {demo
        ? "When you own VOO and QQQ, you also own small slices of NVIDIA, Apple and Microsoft, the same companies you bought directly. "
        : "When you own an ETF, you also own a small slice of every company inside it, sometimes the same companies you bought directly. "}
      <Term term="look-through">Look-through</Term> adds those slices together so you see your real exposure.
    </p>
  );
}

// The arithmetic behind the headline, from the model's own numbers.
function Calculation({ model }: { model: XrayModel }) {
  const lead = model.topTen[0];
  if (!lead) return <p>No equity exposure to break down.</p>;
  const pct = (v: number) => formatPct(v / model.total);
  return (
    <div className="flex flex-col gap-1">
      <p>
        Look-through value of a company = value held directly + Σ (fund value × the company&apos;s weight in that fund). Weight = that
        value ÷ total portfolio value ({formatUSD(model.total)}).
      </p>
      <p className="font-mono text-[12px] text-text">
        {lead.ticker}: {lead.sources.map((s) => `${s.via} ${formatUSD(s.value, 2)}`).join(" + ")} = {formatUSD(lead.value, 2)} ({pct(lead.value)})
      </p>
      <p>Flags: any company above 10% or sector above 35% of total value.</p>
    </div>
  );
}

// Material at every level: when the prices are from, and any fund we can only partly (or not) see inside.
function MaterialNotices({ model }: { model: XrayModel }) {
  const m = xrayMaterial(model);
  if (!m.partial.length && !m.opaque.length && !m.valuation) return null;
  return (
    <div className="flex flex-col gap-2 text-[13px] text-text-muted">
      {m.valuation ? (
        <p>
          Values: {m.valuation.source} ·{" "}
          {/^\d{4}-\d{2}-\d{2}$/.test(m.valuation.asOf) ? m.valuation.asOf : new Date(m.valuation.asOf).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
        </p>
      ) : null}
      {m.partial.length > 0 ? (
        <p role="note" className="flex items-start gap-2">
          <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-sev-medium" />
          <span>
            <Term term="coverage">Partial coverage</Term>:{" "}
            {m.partial.map((c) => `${c.ticker} ${formatPct(c.visibleShare ?? 0, 0)} of fund weight visible`).join(", ")}. The rest is counted
            in its fund&apos;s total but not traced to companies, so exposures from it are unknown, not zero.
          </span>
        </p>
      ) : null}
    </div>
  );
}

// Says whose portfolio this is, and names any fund we couldn't see inside.
function ImportedNotice({ model }: { model: XrayModel }) {
  const resetToDemo = usePortfolio((s) => s.resetToDemo);
  const practice = usePortfolio((s) => s.kind === "practice");
  const demo = usePortfolio((s) => s.imported === null);
  if (model.mode !== "live") return null;
  const opaque = model.opaque;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-border bg-surface-1 px-4 py-3 text-[13px] text-text-muted">
      <Info aria-hidden className="size-4 shrink-0 text-accent" />
      <span className="min-w-0 flex-1">
        {demo
          ? "Demo portfolio: seven sample positions, valued at live prices with published ETF holdings."
          : practice
            ? "Practice portfolio: no real money. This is what your pretend dollars would hold, at live prices."
            : "Look-through of your imported portfolio, from live prices and published ETF holdings."}
        {opaque.length > 0
          ? ` No holdings data for ${opaque.join(", ")}, so ${opaque.length === 1 ? "it counts" : "they count"} as ${opaque.length === 1 ? "a single position" : "single positions"}.`
          : ""}
      </span>
      {!demo && (
        <button
          type="button"
          onClick={resetToDemo}
          className="rounded-md font-medium text-text transition-colors duration-150 hover:text-accent"
        >
          Switch to demo
        </button>
      )}
    </div>
  );
}

export function XrayHero({ model }: { model: XrayModel }) {
  const level = useLevelValue();
  const demoPortfolio = usePortfolio((s) => s.imported === null);

  return (
    <section className="flex flex-col gap-6 [@media(max-height:800px)]:gap-5">
      <ImportedNotice model={model} />
      <PageHeader
        eyebrow="X-Ray"
        headline={model.headline[level]}
        subline={model.subline[level]}
        actions={<HeaderStats model={model} />}
      />
      <SectionControls id="xray-hero" explain={<Explanation demo={demoPortfolio} />} calculation={<Calculation model={model} />} />
      <ApertureMap model={model} />
      <FlagsStrip flags={model.flags} />
      <MaterialNotices model={model} />
    </section>
  );
}
