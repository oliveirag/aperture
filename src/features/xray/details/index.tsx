"use client";

import { DisclosureSection } from "@/components/shared/disclosure";
import { PERFORMANCE } from "@/data/performance";
import { formatPct } from "@/lib/format";
import { usePolicy } from "@/lib/experience/store";
import type { XrayModel } from "@/lib/xray/types";
import { xrayView } from "@/lib/xray/view";
import { ChangesCard, useRecordVisit } from "./changes";
import { CompareFunds } from "./compare-funds";
import { HistoricalRange } from "./historical-range";
import { Holdings } from "./holdings";
import { LearnCard } from "./learn-card";
import { LivePerformance } from "./live-performance";
import { OverlapVenn } from "./overlap-venn";
import { PerformanceChart } from "./performance-chart";
import { SectorDonut } from "./sector-donut";
import { TopTen } from "./top-ten";

// Every breakdown is reachable at every level. The level only decides which cards start open; a collapsed card keeps
// its title and a one-line summary with a "Show" button. Performance and the historical range fetch price history only
// once they're opened.
export function XrayDetails({ model }: { model: XrayModel }) {
  const policy = usePolicy();
  const { sections } = xrayView(model, policy);
  useRecordVisit(model);
  const topSector = model.sectors.find((s) => s.sector !== "Other");

  return (
    <section aria-labelledby="xray-breakdown" className="flex flex-col gap-4">
      <h2 id="xray-breakdown" className="text-[20px] font-medium tracking-[-0.01em] text-text">
        Breakdown
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <DisclosureSection id="xray-changes" title="Since your last visit" summary="What moved since you last opened this portfolio." fallback={sections.changes} className="lg:col-span-12">
          <ChangesCard model={model} />
        </DisclosureSection>
        <DisclosureSection id="xray-holdings" title="Holdings" summary={`${model.positionsCount} positions with prices and weights.`} fallback={sections.holdings} className="lg:col-span-12">
          <Holdings />
        </DisclosureSection>
        <TopTen model={model} />
        <DisclosureSection
          id="xray-sectors"
          title="Sectors"
          summary={topSector ? `Largest: ${topSector.sector} at ${formatPct(topSector.weight)}.` : "Where your money sits by industry."}
          fallback={sections.sectors}
          className="lg:col-span-5"
        >
          <SectorDonut sectors={model.sectors} />
        </DisclosureSection>
        <OverlapVenn model={model} />
        {model.overlaps.length > 0 ? (
          <DisclosureSection id="xray-compare" title="Compare funds" summary="Which companies two of your funds both send you." fallback={sections.compare} className="lg:col-span-12">
            <CompareFunds model={model} />
          </DisclosureSection>
        ) : null}
        {/* Weekly closes from Alpha Vantage (Finnhub candles are premium); the canon series only backs the offline snapshot. */}
        <DisclosureSection id="xray-performance" title="Performance" summary="A year of weekly values at today's share counts (not your actual returns)." fallback={sections.performance} className="lg:col-span-12">
          {model.mode === "demo" ? <PerformanceChart series={PERFORMANCE} /> : <LivePerformance />}
        </DisclosureSection>
        <DisclosureSection id="xray-range" title="Historical range" summary="How far each holding's price has moved over past 3-month spans. Not a forecast." fallback={sections.range} className="lg:col-span-12">
          <HistoricalRange />
        </DisclosureSection>
        <DisclosureSection id="xray-learn" title="Why concentration matters" summary="A short explanation in plain words." fallback={sections.learn} className="lg:col-span-12">
          <LearnCard />
        </DisclosureSection>
      </div>
    </section>
  );
}
