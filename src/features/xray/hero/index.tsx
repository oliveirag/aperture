"use client";

import { useState } from "react";
import { ArrowRight, ChevronDown, Info } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { PageHeader } from "@/components/shared/page-header";
import { Term } from "@/components/shared/term";
import { POSITIONS_COUNT, UNDERLYING_COMPANIES, XRAY_HEADLINE, XRAY_SUBLINE } from "@/data/xray";
import { formatUSD } from "@/lib/format";
import { useLevel } from "@/lib/level";
import { useLiveHoldings } from "@/lib/market";
import { usePortfolio } from "@/lib/portfolio-store";
import { cn } from "@/lib/utils";
import { FlagsStrip } from "./flags-strip";
import { LookthroughMap } from "./lookthrough-map";

function HeaderStats() {
  const { total } = useLiveHoldings();
  return (
    <div className="flex gap-8">
      <div>
        <p className="text-[12px] text-text-muted">Portfolio value</p>
        <p className="mt-0.5 text-[20px] font-semibold tracking-[-0.01em] text-text tabular-nums">
          {formatUSD(total)}
        </p>
      </div>
      <div>
        <p className="text-[12px] text-text-muted">Look-through</p>
        <p className="mt-0.5 flex items-center gap-2 text-[20px] font-semibold tracking-[-0.01em] text-text tabular-nums">
          {POSITIONS_COUNT} positions
          <ArrowRight aria-hidden className="size-4 text-text-muted" />
          {UNDERLYING_COMPANIES} companies
        </p>
      </div>
    </div>
  );
}

function BeginnerExplainer() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md text-[14px] font-medium text-text-muted transition-colors duration-150 hover:text-text"
      >
        What does this mean?
        <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-200 ease-out", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="max-w-[72ch] overflow-hidden pt-2 text-[15px] leading-6 text-text-muted"
          >
            An <Term term="ETF">ETF</Term> is a basket of many companies. When you own VOO and QQQ, you also own small
            slices of NVIDIA, Apple and Microsoft, the same companies you bought directly.{" "}
            <Term term="look-through">Look-through</Term> adds those slices together so you see your real exposure.
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// Look-through data exists only for the demo portfolio, so say so when the user's own holdings are loaded.
function ImportedNotice() {
  const imported = usePortfolio((s) => s.imported !== null);
  const resetToDemo = usePortfolio((s) => s.resetToDemo);
  if (!imported) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-surface-1 px-4 py-3 text-[13px] text-text-muted">
      <Info aria-hidden className="size-4 shrink-0 text-accent" />
      <span className="min-w-0 flex-1">
        Your imported holdings drive the portfolio value and the Holdings table. The look-through analysis still shows the demo portfolio.
      </span>
      <button
        type="button"
        onClick={resetToDemo}
        className="rounded-md font-medium text-text transition-colors duration-150 hover:text-accent"
      >
        Switch to demo
      </button>
    </div>
  );
}

export function XrayHero() {
  const level = useLevel((s) => s.level);

  return (
    <section className="flex flex-col gap-6 [@media(max-height:800px)]:gap-5">
      <ImportedNotice />
      <PageHeader
        eyebrow="X-Ray"
        headline={XRAY_HEADLINE[level]}
        subline={XRAY_SUBLINE[level]}
        actions={<HeaderStats />}
      />
      {level === "beginner" ? <BeginnerExplainer /> : null}
      <LookthroughMap />
      <FlagsStrip />
    </section>
  );
}
