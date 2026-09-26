"use client";

import { ArrowLeftRight } from "lucide-react";
import { highlightPhrases, useSourceDrawer } from "@/components/shared/source-drawer";
import { NEW_ITEM_PRIOR, REMOVED_ITEM_CURRENT, type RadarCard, type RadarChange } from "@/data/radar";
import { cn } from "@/lib/utils";

const KIND = {
  new: { label: "New", className: "border-accent/50 text-accent" },
  changed: { label: "Changed", className: "border-sev-medium/50 text-sev-medium" },
  removed: { label: "Removed", className: "border-border-strong text-text-muted" },
} as const;

export function ChangeItem({ card, change }: { card: RadarCard; change: RadarChange }) {
  const open = useSourceDrawer((s) => s.open);
  const kind = KIND[change.kind];
  // A removed risk only exists in the prior filing, so that is the wording to show.
  const removed = change.kind === "removed";
  const shown = removed ? (change.prior ?? "") : change.current;

  function compare() {
    open({
      source: { ...card.source, excerpt: shown, highlight: change.highlight[0] },
      compare: {
        prior: change.prior ?? NEW_ITEM_PRIOR,
        current: removed ? REMOVED_ITEM_CURRENT : change.current,
        highlight: removed ? [] : change.highlight,
      },
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
          className="inline-flex h-6 shrink-0 items-center gap-1.5 border border-border px-2.5 text-[12px] font-medium text-text-muted transition-[border-color,color,transform,translate,scale] duration-150 ease-out hover:border-border-strong hover:text-text active:scale-[0.97]"
        >
          <ArrowLeftRight className="size-3" aria-hidden />
          Compare wording
        </button>
      </div>
      <blockquote
        className={cn(
          "border-l-2 border-border-strong pl-3 text-[14px] leading-[22px] text-text-muted",
          removed && "line-through decoration-text-subtle/60",
        )}
      >
        {highlightPhrases(shown, change.highlight)}
      </blockquote>
    </li>
  );
}
