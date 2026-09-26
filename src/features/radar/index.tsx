"use client";

import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import { useXray } from "@/features/xray/use-xray";
import { usePortfolio } from "@/lib/portfolio-store";
import { DemoRadar } from "./demo-radar";
import { LiveRadar } from "./live-radar";

// Curated cards for the demo portfolio; real SEC filing comparisons for an imported or practice one.
export function RadarPage() {
  const xray = useXray();
  const imported = usePortfolio((s) => s.imported);

  if (xray.status === "loading") {
    return (
      <div className="flex flex-col gap-8" aria-busy="true">
        <p className="eyebrow">Filing Radar</p>
        <p className="flex items-center gap-3 text-[18px] font-light text-text-muted">
          <LoaderCircle aria-hidden className="size-5 animate-spin text-accent" />
          Finding the companies you own…
        </p>
      </div>
    );
  }
  if (xray.status === "error") {
    return (
      <div className="flex flex-col gap-6">
        <p className="eyebrow">Filing Radar</p>
        <p className="flex items-start gap-3 text-[18px] font-light text-text">
          <AlertTriangle aria-hidden className="mt-1 size-5 shrink-0 text-sev-medium" />
          Couldn&apos;t work out which companies you own ({xray.error}).
        </p>
        <button
          type="button"
          onClick={xray.retry}
          className="inline-flex h-10 w-fit items-center gap-2 bg-text px-4 text-[14px] font-medium text-bg transition-[background-color,transform,translate,scale] duration-150 ease-out hover:bg-text/85 active:scale-[0.97]"
        >
          <RotateCcw aria-hidden className="size-4" />
          Try again
        </button>
      </div>
    );
  }
  if (xray.model.mode === "demo" || !imported) return <DemoRadar />;
  return <LiveRadar model={xray.model} holdings={imported} />;
}
