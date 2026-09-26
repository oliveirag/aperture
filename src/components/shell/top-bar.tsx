"use client";

import { useEffect, useState } from "react";
import { DAY_CHANGE, PORTFOLIO_TOTAL } from "@/data/portfolio";
import { formatSignedPct, formatSignedUSD, formatUSD } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LevelSwitcher } from "./level-switcher";

const PORTFOLIO_VALUE = formatUSD(PORTFOLIO_TOTAL);
const DAY_CHANGE_LABEL = `${formatSignedUSD(DAY_CHANGE.value)} (${formatSignedPct(DAY_CHANGE.pct, 2)})`;

// Translucent layer that content scrolls under. The divider only appears once content is actually beneath it.
export function TopBar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "material-glass sticky top-0 z-30 h-14 border-b bg-bg/80 backdrop-blur-xl backdrop-saturate-150 transition-[border-color] duration-200",
        scrolled ? "border-border" : "border-transparent",
      )}
    >
      <div className="mx-auto flex h-full max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <span className="hidden rounded-md border border-border-strong px-2 py-0.5 text-[11px] font-medium text-text-muted sm:inline-flex">
            Demo portfolio
          </span>
          <div className="flex items-baseline gap-2 whitespace-nowrap">
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-text tabular-nums">{PORTFOLIO_VALUE}</span>
            <span className="hidden text-[13px] text-positive tabular-nums sm:inline">{DAY_CHANGE_LABEL}</span>
          </div>
        </div>
        <LevelSwitcher />
      </div>
    </header>
  );
}
