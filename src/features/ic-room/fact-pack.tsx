"use client";

import { Check, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { FACT_PACK_STEPS } from "@/data/ic-room";
import { cn } from "@/lib/utils";
import { useEnter } from "./enter";

// Checklist of what the committee reads before it speaks. Step i is in progress while i === done.
export function FactPack({ done }: { done: number }) {
  const enter = useEnter(4, 0.2);
  const visible = Math.min(FACT_PACK_STEPS.length, done + 1);

  return (
    <ul className="flex flex-col gap-2">
      {FACT_PACK_STEPS.slice(0, visible).map((step, i) => {
        const complete = i < done;
        return (
          <motion.li
            key={step}
            {...enter}
            className={cn(
              "flex items-center gap-2.5 text-[13px] transition-colors duration-200",
              complete ? "text-text-muted" : "text-text",
            )}
          >
            <span className="flex size-4 items-center justify-center">
              {complete ? (
                <Check className="size-3.5 text-positive" aria-hidden />
              ) : (
                <Loader2 className="size-3.5 animate-spin text-text-subtle" aria-hidden />
              )}
            </span>
            {step}
            <span className="sr-only">{complete ? "(done)" : "(in progress)"}</span>
          </motion.li>
        );
      })}
    </ul>
  );
}
