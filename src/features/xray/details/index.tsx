"use client";

import { useLevel } from "@/lib/level";
import type { XrayModel } from "@/lib/xray/types";
import { HistoricalRange } from "./historical-range";
import { Holdings } from "./holdings";
import { LearnCard } from "./learn-card";
import { OverlapVenn } from "./overlap-venn";
import { PERFORMANCE } from "@/data/performance";
import { LivePerformance } from "./live-performance";
import { PerformanceChart } from "./performance-chart";
import { SectorDonut } from "./sector-donut";
import { TopTen } from "./top-ten";

export function XrayDetails({ model }: { model: XrayModel }) {
  const level = useLevel((s) => s.level);

  return (
    <section aria-labelledby="xray-breakdown" className="flex flex-col gap-4">
      <h2 id="xray-breakdown" className="text-[20px] font-medium tracking-[-0.01em] text-text">
        Breakdown
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {level !== "beginner" && <Holdings />}
        <TopTen model={model} />
        {level !== "beginner" && <SectorDonut sectors={model.sectors} />}
        <OverlapVenn model={model} />
        {/* Demo: the canon weekly series. Your own portfolio: weekly closes from Alpha Vantage (Finnhub candles are premium). */}
        {level === "advanced" && (model.mode === "demo" ? <PerformanceChart series={PERFORMANCE} /> : <LivePerformance />)}
        {level === "advanced" && <HistoricalRange />}
        {level === "beginner" ? <LearnCard /> : null}
      </div>
    </section>
  );
}
