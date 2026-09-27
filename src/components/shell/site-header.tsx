"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/shared/lens-mark";
import { AccountMenu } from "@/features/account/account-menu";
import { AskButton } from "@/features/ask/ask-panel";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

// Editorial masthead: boxed wordmark, plain-text navigation with a growing underline, Ask and account on the right.
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
      <div className="bx-container flex h-20 items-center justify-between gap-6 lg:h-24 2xl:gap-8">
        <Link href="/" aria-label="Aperture home" className="shrink-0">
          <Wordmark size="sm" className="lg:hidden" />
          <Wordmark className="hidden lg:inline-flex" />
        </Link>

        <nav aria-label="Primary" className="hidden flex-1 min-[1400px]:block">
          <ul className="flex items-center justify-end gap-6 2xl:gap-9">
            {NAV_ITEMS.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive(href) ? "page" : undefined}
                  className="link-underline pb-1 text-[17px] font-light whitespace-nowrap text-text"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden shrink-0 items-center gap-3 md:flex lg:gap-5 min-[1400px]:border-l min-[1400px]:border-border min-[1400px]:pl-6 2xl:gap-8 2xl:pl-8">
          <AskButton />
          <AccountMenu />
        </div>
      </div>

      {/* Below 1400px (masthead full with Ask and account) the destinations move to a row underneath. */}
      <nav aria-label="Primary" className="border-t border-border min-[1400px]:hidden">
        <div className="bx-container flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border py-3 md:hidden">
          <AskButton className="h-8" />
          <AccountMenu align="start" />
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
