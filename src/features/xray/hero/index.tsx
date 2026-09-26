"use client";

import { useState } from "react";
import { ArrowRight, ChevronDown, Info } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { PageHeader } from "@/components/shared/page-header";
import { Term } from "@/components/shared/term";
import { formatUSD } from "@/lib/format";
import { useLevel } from "@/lib/level";
import { useLiveHoldings } from "@/lib/market";
import { usePortfolio } from "@/lib/portfolio-store";
import { cn } from "@/lib/utils";
import type { XrayModel } from "@/lib/xray/types";
import { FlagsStrip } from "./flags-strip";
import { LookthroughMap } from "./lookthrough-map";

function HeaderStats({ model }: { model: XrayModel }) {
  const { total } = useLiveHoldings();
  return (
    <div className="flex flex-wrap gap-x-12 gap-y-6">
      <div>
        <p className="text-[14px] font-normal text-text">Portfolio value</p>
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

function BeginnerExplainer({ demo }: { demo: boolean }) {
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
            An <Term term="ETF">ETF</Term> is a basket of many companies.{" "}
            {demo
              ? "When you own VOO and QQQ, you also own small slices of NVIDIA, Apple and Microsoft, the same companies you bought directly. "
              : "When you own an ETF, you also own a small slice of every company inside it, sometimes the same companies you bought directly. "}
            <Term term="look-through">Look-through</Term> adds those slices together so you see your real exposure.
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// Says whose portfolio this is, and names any fund we couldn't see inside.
function ImportedNotice({ model }: { model: XrayModel }) {
  const resetToDemo = usePortfolio((s) => s.resetToDemo);
  if (model.mode !== "live") return null;
  const opaque = model.opaque;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-border bg-surface-1 px-4 py-3 text-[13px] text-text-muted">
      <Info aria-hidden className="size-4 shrink-0 text-accent" />
      <span className="min-w-0 flex-1">
        Look-through of your imported portfolio, from live prices and published ETF holdings.
        {opaque.length > 0
          ? ` No holdings data for ${opaque.join(", ")}, so ${opaque.length === 1 ? "it counts" : "they count"} as ${opaque.length === 1 ? "a single position" : "single positions"}.`
          : ""}
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

export function XrayHero({ model }: { model: XrayModel }) {
  const level = useLevel((s) => s.level);

  return (
    <section className="flex flex-col gap-6 [@media(max-height:800px)]:gap-5">
      <ImportedNotice model={model} />
      <PageHeader
        eyebrow="X-Ray"
        headline={model.headline[level]}
        subline={model.subline[level]}
        actions={<HeaderStats model={model} />}
      />
      {level === "beginner" ? <BeginnerExplainer demo={model.mode === "demo"} /> : null}
      <LookthroughMap model={model} />
      <FlagsStrip flags={model.flags} />
    </section>
  );
}
