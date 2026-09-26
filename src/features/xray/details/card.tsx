"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

// Breakdown card. Fades up 8px the first time it scrolls into view.
export function DetailCard({
  title,
  headline,
  action,
  className,
  children,
}: {
  title: string;
  headline?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -40px 0px" }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className={cn("min-w-0 rounded-2xl border border-border bg-surface-1 p-6", className)}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[13px] font-medium tracking-[0.08em] text-text-muted uppercase">{title}</h3>
          {headline ? <div className="mt-1.5 text-[18px] font-semibold tracking-[-0.01em] text-text">{headline}</div> : null}
        </div>
        {action}
      </header>
      {children}
    </motion.section>
  );
}
