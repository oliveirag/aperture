"use client";

import { SourceChip } from "@/components/shared/source-chip";
import { useSourceDrawer, type SourceDrawerPayload } from "@/components/shared/source-drawer";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { IcRef } from "@/data/ic-room";
import type { Source } from "@/types/demo";
import { cn } from "@/lib/utils";
import { useIcData } from "./run-data";

export const FIT_TABLE_ID = "ic-portfolio-fit";

export function factPayload(facts: Source[], id: string): SourceDrawerPayload | null {
  const source = facts.find((f) => f.id === id);
  return source ? { source, meta: [{ label: "Fact", value: id }] } : null;
}

function scrollToFit() {
  const el = document.getElementById(FIT_TABLE_ID);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.focus({ preventScroll: true });
}

const REF_CLASS =
  "inline-flex h-5 items-center rounded-md border border-border bg-surface-2 px-1.5 align-[1px] font-mono text-[11px] font-medium text-text-muted transition-[border-color,color,transform,translate,scale] duration-150 ease-out hover:border-border-strong hover:text-text active:scale-[0.96]";

// Compact inline citation: [F1] opens the drawer, [FIT] points at the portfolio-fit table.
export function FactRef({ id, className }: { id: IcRef; className?: string }) {
  const open = useSourceDrawer((s) => s.open);
  const { facts, fitNote } = useIcData();

  if (id === "FIT") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={scrollToFit}
              aria-label={`FIT: ${fitNote}`}
              className={cn(REF_CLASS, "border-accent/40 text-accent hover:border-accent", className)}
            />
          }
        >
          FIT
        </TooltipTrigger>
        <TooltipContent className="border border-border-strong bg-surface-3 px-3 py-2 text-[13px] text-text [&_[data-slot=tooltip-arrow]]:hidden">
          {fitNote}
        </TooltipContent>
      </Tooltip>
    );
  }

  const payload = factPayload(facts, id);
  if (!payload) return null;
  return (
    <button
      type="button"
      onClick={() => open(payload)}
      title={payload.source.title}
      aria-label={`${id}: ${payload.source.title}`}
      className={cn(REF_CLASS, className)}
    >
      {id}
    </button>
  );
}

// Evidence-line chip on the stage: a small SourceChip labelled with the fact id.
export function FactChip({ id }: { id: IcRef }) {
  const { facts } = useIcData();
  if (id === "FIT") return <FactRef id="FIT" />;
  const payload = factPayload(facts, id);
  return payload ? <SourceChip payload={payload} label={id} className="h-5 px-2 text-[11px]" /> : null;
}
