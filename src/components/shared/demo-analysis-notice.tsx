"use client";

import { Info } from "lucide-react";
import { useHydratePortfolio, usePortfolio } from "@/lib/portfolio-store";

// Shown on analyses that only exist for the demo portfolio, so an imported or practice portfolio never passes them off as its own.
export function DemoAnalysisNotice({ feature }: { feature: string }) {
  useHydratePortfolio();
  const imported = usePortfolio((s) => s.hydrated && s.imported !== null);
  const resetToDemo = usePortfolio((s) => s.resetToDemo);
  if (!imported) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-border bg-surface-1 px-4 py-3 text-[13px] text-text-muted">
      <Info aria-hidden className="size-4 shrink-0 text-accent" />
      <span className="min-w-0 flex-1">
        {feature} isn&apos;t available for your own portfolios yet. This is the demo portfolio&apos;s analysis, not yours.
      </span>
      <button type="button" onClick={resetToDemo} className="rounded-md font-medium text-text transition-colors duration-150 hover:text-accent">
        Switch to demo
      </button>
    </div>
  );
}
