"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGroup } from "motion/react";
import { Wordmark } from "@/components/shared/lens-mark";
import { DAY_CHANGE, PORTFOLIO_TOTAL } from "@/data/portfolio";
import { formatSignedPct, formatSignedUSD, formatUSD } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LevelSwitcher } from "./level-switcher";
import { NAV_ITEMS } from "./nav-items";

const PORTFOLIO_VALUE = formatUSD(PORTFOLIO_TOTAL);
const DAY_CHANGE_LABEL = `${formatSignedUSD(DAY_CHANGE.value)} (${formatSignedPct(DAY_CHANGE.pct, 2)})`;

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

// Editorial masthead: boxed wordmark, plain-text navigation with a growing underline, portfolio and level on the right.
// Stays put while content scrolls under it; a hairline appears only once something is beneath it.
export function SiteHeader() {
  const isActive = useIsActive();
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
        "sticky top-0 z-30 border-b bg-bg transition-[border-color] duration-300",
        scrolled ? "border-border" : "border-transparent",
      )}
    >
      <div className="bx-container flex h-20 items-center justify-between gap-8 lg:h-24">
        <Link href="/" aria-label="Lookthrough home" className="shrink-0">
          <Wordmark size="sm" className="lg:hidden" />
          <Wordmark className="hidden lg:inline-flex" />
        </Link>

        <nav aria-label="Primary" className="hidden flex-1 lg:block">
          <ul className="flex items-center justify-end gap-9">
            {NAV_ITEMS.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive(href) ? "page" : undefined}
                  className="link-underline pb-1 text-[17px] font-light text-text"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden shrink-0 items-center gap-8 md:flex lg:border-l lg:border-border lg:pl-8">
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-[11px] font-normal tracking-[0.08em] text-text-muted uppercase">Demo portfolio</p>
            <p className="mt-0.5 whitespace-nowrap tabular-nums">
              <span className="text-[17px] font-normal text-text">{PORTFOLIO_VALUE}</span>
              <span className="ml-2 hidden text-[13px] text-positive xl:inline">{DAY_CHANGE_LABEL}</span>
            </p>
          </div>
          <LevelSwitcher />
        </div>
      </div>

      {/* Under 1024px the destinations move to a scrollable row under the masthead. */}
      <nav aria-label="Primary" className="border-t border-border lg:hidden">
        <div className="bx-container flex justify-end border-b border-border py-3 md:hidden">
          {/* Its own layout namespace so the underline doesn't fly between the two switchers. */}
          <LayoutGroup id="level-mobile">
            <LevelSwitcher />
          </LayoutGroup>
        </div>
        <ul className="bx-container flex gap-7 overflow-x-auto py-3">
          {NAV_ITEMS.map(({ href, label }) => (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className="link-underline pb-0.5 text-[15px] font-light text-text"
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
