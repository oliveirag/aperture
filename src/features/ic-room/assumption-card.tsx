"use client";

import { ArrowDownRight, ArrowUpRight, CheckCircle2, CircleDashed, HelpCircle, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Assumption, AssumptionStatus, EvidenceLine } from "@/data/ic-room";
import { cn } from "@/lib/utils";
import { EASE_OUT, useAnimated, useEnter } from "./enter";
import { FactChip } from "./fact-ref";

export const STATUS = {
  supported: { label: "Supported", icon: CheckCircle2, tone: "text-positive", border: "border-positive/50" },
  contested: { label: "Contested", icon: CircleDashed, tone: "text-sev-medium", border: "border-sev-medium/50" },
  unresolved: { label: "Unresolved", icon: HelpCircle, tone: "text-text-muted", border: "border-border-strong" },
} satisfies Record<AssumptionStatus, { label: string; icon: typeof CheckCircle2; tone: string; border: string }>;

export function StatusPill({ status }: { status: AssumptionStatus | "testing" }) {
  if (status === "testing") {
    return (
      <span className="inline-flex h-6 shrink-0 items-center gap-1.5 border border-border px-2 text-[12px] font-medium text-text-subtle">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        Testing
      </span>
    );
  }
  const { label, icon: Icon, tone, border } = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 border px-2 text-[12px] font-medium",
        tone,
        border,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}

function Line({ line, kind }: { line: EvidenceLine; kind: "for" | "against" }) {
  const animated = useAnimated();
  const Icon = kind === "for" ? ArrowUpRight : ArrowDownRight;
  return (
    <motion.li
      initial={animated ? { opacity: 0, height: 0 } : false}
      animate={{ opacity: 1, height: "auto" }}
      transition={{ duration: 0.25, ease: EASE_OUT }}
      className="overflow-hidden"
    >
      <div className="flex items-start gap-2 pt-2 text-[13px] leading-5">
        <Icon
          className={cn("mt-0.5 size-3.5 shrink-0", kind === "for" ? "text-positive" : "text-negative")}
          aria-hidden
        />
        <span className="sr-only">{kind === "for" ? "For:" : "Against:"}</span>
        <span className="min-w-0 flex-1 text-text-muted">{line.text}</span>
        <FactChip id={line.factId} />
      </div>
    </motion.li>
  );
}

export function AssumptionCard({
  assumption,
  showFor,
  showAgainst,
}: {
  assumption: Assumption;
  showFor: boolean;
  showAgainst: boolean;
}) {
  const enter = useEnter();
  return (
    <motion.article
      {...enter}
      className="bg-surface-1 p-4"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 font-mono text-[12px] font-medium text-text-subtle">{assumption.id}</span>
        <p className="min-w-0 flex-1 text-[14px] leading-[22px] font-medium text-text">{assumption.text}</p>
        <StatusPill status={showAgainst ? assumption.status : "testing"} />
      </div>
      <ul className="pl-7">
        <AnimatePresence initial={false}>
          {showFor
            ? assumption.for.map((line) => <Line key={`f-${line.text}`} line={line} kind="for" />)
            : null}
          {showAgainst
            ? assumption.against.map((line) => <Line key={`a-${line.text}`} line={line} kind="against" />)
            : null}
        </AnimatePresence>
      </ul>
    </motion.article>
  );
}
