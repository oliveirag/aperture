"use client";

import { ArrowLeftRight } from "lucide-react";
import { highlightPhrases, useSourceDrawer } from "@/components/shared/source-drawer";
import { NEW_ITEM_PRIOR, type RadarCard, type RadarChange } from "@/data/radar";
import { cn } from "@/lib/utils";

const REMOVED_ITEM_CURRENT = "Not present in the latest filing.";

const KIND = {
  new: { label: "New", className: "border-accent/50 text-accent" },
  changed: { label: "Changed", className: "border-sev-medium/50 text-sev-medium" },
  removed: { label: "Removed", className: "border-border-strong text-text-muted" },
} as const;

export function ChangeItem({ card, change }: { card: RadarCard; change: RadarChange }) {
  const open = useSourceDrawer((s) => s.open);
  const kind = KIND[change.kind];

  function compare() {
    open({
      source: { ...card.source, excerpt: change.current, highlight: change.highlight[0] },
      compare:
        change.kind === "removed"
          ? { prior: change.current, current: REMOVED_ITEM_CURRENT, highlight: change.highlight }
          : { prior: change.prior ?? NEW_ITEM_PRIOR, current: change.current, highlight: change.highlight },
    });
  }

  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("shrink-0 rounded-md border px-1.5 py-px text-[11px] font-medium", kind.className)}>
            {kind.label}
          </span>
          <span className="truncate text-[14px] font-medium text-text">{change.label}</span>
        </div>
        <button
          type="button"
          onClick={compare}
          className="inline-flex h-6 shrink-0 items-center gap-1.5 border border-border px-2.5 text-[12px] font-medium text-text-muted transition-[border-color,color,transform] duration-150 ease-out hover:border-border-strong hover:text-text active:scale-[0.97]"
        >
          <ArrowLeftRight className="size-3" aria-hidden />
          Compare wording
        </button>
      </div>
      <blockquote className="border-l-2 border-border-strong pl-3 text-[14px] leading-[22px] text-text-muted">
        {highlightPhrases(change.current, change.highlight)}
      </blockquote>
    </li>
  );
}
