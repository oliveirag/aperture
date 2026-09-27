"use client";

import type { ReactNode } from "react";
import { GLOSSARY, type GlossaryTerm } from "@/data/glossary";
import { usePolicy } from "@/lib/experience/store";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Glossary tooltip, reachable by hover and keyboard focus at every level. The level only changes how visibly the term
// is marked: a dotted underline (Beginner), a faint one (Intermediate), none (Advanced).
export function Term({ term, children }: { term: GlossaryTerm; children: ReactNode }) {
  const { glossary } = usePolicy();

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            aria-description={GLOSSARY[term]}
            className={cn(
              "cursor-help underline-offset-4 outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-accent",
              glossary === "inline" && "underline decoration-text-subtle decoration-dotted",
              glossary === "subtle" && "underline decoration-text-subtle/40 decoration-dotted",
            )}
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
