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

const EASE_EDITORIAL = [0.22, 1, 0.36, 1] as const;
const LONG_HEADLINE = 100;

// Editorial header: tracked eyebrow with its rule, one light serif sentence, a quiet subline.
// The headline rises in slowly (editorial pace) and re-animates when its text changes with the level.
export function PageHeader({ eyebrow, headline, subline, actions }: PageHeaderProps) {
  const reduce = useReducedMotion();
  const key = typeof headline === "string" ? headline : undefined;
  // The headline spans the content width so it holds to two lines at 1280; the longest (Advanced) step down.
  const long = (key?.length ?? 0) > LONG_HEADLINE;

  return (
    <header className="flex min-w-0 flex-col">
      {eyebrow ? <p className="eyebrow mb-8">{eyebrow}</p> : null}
      <AnimatePresence mode="wait" initial={true}>
        <motion.h1
          key={key}
          initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(16px)" }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px)" }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          transition={{ duration: 0.8, ease: EASE_EDITORIAL }}
          className={cn(
            "display text-balance text-text",
            // Size before leading: tailwind-merge drops a leading-* that precedes a text-[size].
            long ? "text-[32px] sm:text-[42px]" : "text-[36px] sm:text-[52px]",
            "leading-[1.14]",
          )}
        >
          {headline}
        </motion.h1>
      </AnimatePresence>
      {subline || actions ? (
        <div className="mt-8 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          {subline ? (
            <p className="max-w-[60ch] text-[18px] leading-[1.6] font-light text-pretty text-text-muted">{subline}</p>
          ) : (
            <span />
          )}
          {actions ? <div className="flex shrink-0 items-end gap-10">{actions}</div> : null}
        </div>
      ) : null}
    </header>
  );
}
