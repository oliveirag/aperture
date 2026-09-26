"use client";

import { Building2, Cpu, type LucideIcon } from "lucide-react";
import { SCENARIOS } from "@/data/shock";
import { cn } from "@/lib/utils";
import type { ScenarioId } from "@/types/demo";

const ICONS: Record<ScenarioId, LucideIcon> = { cre: Building2, "ai-capex": Cpu };

export function ScenarioPicker({
  activeId,
  onRun,
}: {
  activeId: ScenarioId | null;
  onRun: (id: ScenarioId) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {SCENARIOS.map((s) => {
        const Icon = ICONS[s.id];
        const active = activeId === s.id;
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={active}
            onClick={() => onRun(s.id)}
            className={cn(
              "flex min-h-[72px] items-center gap-3 rounded-2xl border bg-surface-1 px-4 py-3 text-left transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.98]",
              active ? "border-accent/70 bg-surface-2" : "border-border hover:border-border-strong",
            )}
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center transition-colors duration-150",
                active ? "bg-accent/15 text-accent" : "bg-surface-2 text-text-muted",
              )}
            >
              <Icon aria-hidden className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1" title={s.description}>
              <span className="block text-[14px] leading-5 font-medium text-balance text-text">{s.label}</span>
              <span className="mt-0.5 block text-[12px] leading-4 text-text-muted tabular-nums">{s.shortLabel}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
