"use client";

import type { ReactNode } from "react";
import { GLOSSARY, type GlossaryTerm } from "@/data/glossary";
import { useLevel } from "@/lib/level";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Beginner-only glossary tooltip. At other levels it renders the children untouched.
export function Term({ term, children }: { term: GlossaryTerm; children: ReactNode }) {
  const level = useLevel((s) => s.level);
  if (level !== "beginner") return <>{children}</>;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            className="cursor-help underline decoration-text-subtle decoration-dotted underline-offset-4 outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-accent"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px] border border-border-strong bg-surface-3 px-3 py-2 text-[13px] leading-5 text-text shadow-[0_8px_24px_rgba(0,0,0,0.4)] [&_[data-slot=tooltip-arrow]]:hidden">
        {GLOSSARY[term]}
      </TooltipContent>
    </Tooltip>
  );
}
