"use client";

import { SourceChip } from "@/components/shared/source-chip";
import { useSourceDrawer, type SourceDrawerPayload } from "@/components/shared/source-drawer";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { IC_FACTS, PORTFOLIO_FIT_NOTE, type IcRef } from "@/data/ic-room";
import { cn } from "@/lib/utils";

export const FIT_TABLE_ID = "ic-portfolio-fit";

export function factPayload(id: string): SourceDrawerPayload {
  const source = IC_FACTS.find((f) => f.id === id);
  if (!source) throw new Error(`Unknown fact ${id}`);
  return { source, meta: [{ label: "Fact", value: id }] };
}

function scrollToFit() {
  const el = document.getElementById(FIT_TABLE_ID);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.focus({ preventScroll: true });
}

const REF_CLASS =
  "inline-flex h-5 items-center rounded-md border border-border bg-surface-2 px-1.5 align-[1px] font-mono text-[11px] font-medium text-text-muted transition-[border-color,color,transform] duration-150 ease-out hover:border-border-strong hover:text-text active:scale-[0.96]";

// Compact inline citation: [F1] opens the drawer, [FIT] points at the portfolio-fit table.
export function FactRef({ id, className }: { id: IcRef; className?: string }) {
  const open = useSourceDrawer((s) => s.open);

  if (id === "FIT") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={scrollToFit}
              aria-label={`FIT: ${PORTFOLIO_FIT_NOTE}`}
              className={cn(REF_CLASS, "border-accent/40 text-accent hover:border-accent", className)}
            />
          }
        >
          FIT
        </TooltipTrigger>
        <TooltipContent className="border border-border-strong bg-surface-3 px-3 py-2 text-[13px] text-text [&_[data-slot=tooltip-arrow]]:hidden">
          {PORTFOLIO_FIT_NOTE}
        </TooltipContent>
      </Tooltip>
    );
  }

  const fact = IC_FACTS.find((f) => f.id === id);
  return (
    <button
      type="button"
      onClick={() => open(factPayload(id))}
      title={fact?.title}
      aria-label={`${id}: ${fact?.title}`}
      className={cn(REF_CLASS, className)}
    >
      {id}
    </button>
  );
}

// Evidence-line chip on the stage: a small SourceChip labelled with the fact id.
export function FactChip({ id }: { id: IcRef }) {
  if (id === "FIT") return <FactRef id="FIT" />;
  return <SourceChip payload={factPayload(id)} label={id} className="h-5 px-2 text-[11px]" />;
}
