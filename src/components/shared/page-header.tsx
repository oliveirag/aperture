"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  eyebrow?: string;
  headline: ReactNode;
  subline?: ReactNode;
  actions?: ReactNode;
};

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const LONG_HEADLINE = 100;

// Insight-first header: one sentence carries the page. Re-animates when the headline text changes.
export function PageHeader({ eyebrow, headline, subline, actions }: PageHeaderProps) {
  const reduce = useReducedMotion();
  const key = typeof headline === "string" ? headline : undefined;
  // The headline spans the full content width so it holds to two lines at 1280. Only the longest
  // (Advanced) sentences step down a size to stay there.
  const long = (key?.length ?? 0) > LONG_HEADLINE;

  return (
    <header className="flex min-w-0 flex-col">
      {eyebrow ? <p className="mb-2 text-[13px] font-medium text-text-muted">{eyebrow}</p> : null}
      <AnimatePresence mode="wait" initial={true}>
        <motion.h1
          key={key}
          initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(8px)" }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px)" }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
          className={cn(
            "font-semibold tracking-[-0.02em] text-balance text-text",
            // Size before leading: tailwind-merge drops a leading-* that precedes a text-[size].
            long ? "text-[30px] sm:text-[36px]" : "text-[32px] sm:text-[40px]",
            "leading-[1.1]",
          )}
        >
          {headline}
        </motion.h1>
      </AnimatePresence>
      {subline || actions ? (
        <div className="mt-4 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          {subline ? <p className="max-w-[64ch] text-base leading-6 text-pretty text-text-muted">{subline}</p> : <span />}
          {actions ? <div className="flex shrink-0 items-end gap-6">{actions}</div> : null}
        </div>
      ) : null}
    </header>
  );
}
