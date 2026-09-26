"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

type PageHeaderProps = {
  eyebrow?: string;
  headline: ReactNode;
  subline?: ReactNode;
  actions?: ReactNode;
};

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// Insight-first header: one sentence carries the page. Re-animates when the headline text changes.
export function PageHeader({ eyebrow, headline, subline, actions }: PageHeaderProps) {
  const reduce = useReducedMotion();
  const key = typeof headline === "string" ? headline : undefined;

  return (
    <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-3 text-[13px] font-medium text-text-muted">{eyebrow}</p> : null}
        <AnimatePresence mode="wait" initial={true}>
          <motion.h1
            key={key}
            initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(8px)" }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px)" }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
            className="max-w-[28ch] text-[40px] leading-[1.1] font-semibold tracking-[-0.02em] text-balance text-text"
          >
            {headline}
          </motion.h1>
        </AnimatePresence>
        {subline ? (
          <p className="mt-4 max-w-[64ch] text-base leading-6 text-pretty text-text-muted">{subline}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-end gap-6">{actions}</div> : null}
    </header>
  );
}
