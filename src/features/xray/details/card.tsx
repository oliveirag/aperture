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
      initial={{ opacity: 0, transform: "translateY(24px)" }}
      whileInView={{ opacity: 1, transform: "translateY(0px)" }}
      viewport={{ once: true, margin: "0px 0px -60px 0px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={cn("min-w-0 bg-surface-1 p-8 sm:p-10", className)}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="eyebrow">{title}</h3>
          {headline ? <div className="display mt-5 text-[28px] leading-[1.25] text-text">{headline}</div> : null}
        </div>
        {action}
      </header>
      {children}
    </motion.section>
  );
}
