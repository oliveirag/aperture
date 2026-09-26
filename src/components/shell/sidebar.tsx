"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/shared/lens-mark";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

// Heavier, solid material: the structural layer that frames the page.
export function Sidebar() {
  const isActive = useIsActive();

  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface-1 px-3 py-5 lg:flex">
      <Link href="/" className="mx-2 mb-8 inline-flex w-fit rounded-md">
        <Wordmark />
      </Link>

      <nav aria-label="Primary">
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-9 items-center gap-3 rounded-lg px-3 text-[14px] transition-colors duration-150 ease-out",
                    active ? "bg-surface-2 text-text" : "text-text-muted hover:bg-surface-2/60 hover:text-text",
                  )}
                >
                  {active ? (
                    <span aria-hidden className="absolute top-2 bottom-2 -left-3 w-0.5 rounded-full bg-accent" />
                  ) : null}
                  <Icon className={cn("size-4 shrink-0", active ? "text-text" : "text-text-muted")} aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <p className="mx-3 mt-auto text-[12px] leading-[18px] text-text-subtle">
        Educational tool. Not investment advice.
      </p>
    </aside>
  );
}

// Under 1024px the sidebar becomes a single row of destinations under the top bar.
export function MobileNav() {
  const isActive = useIsActive();

  return (
    <nav aria-label="Primary" className="border-b border-border bg-surface-1 lg:hidden">
      <ul className="mx-auto flex max-w-[1240px] gap-1 overflow-x-auto px-4 py-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-lg px-3 text-[13px] transition-colors duration-150 ease-out",
                  active ? "bg-surface-2 text-text" : "text-text-muted hover:text-text",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
