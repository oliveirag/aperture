"use client";

import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export type FilterValue = "all" | "high" | "medium" | "low";

export function SeverityFilter({
  options,
  value,
  onChange,
}: {
  options: { value: FilterValue; label: string; count: number }[];
  value: FilterValue;
  onChange: (v: FilterValue) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = (i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Filter by severity" onKeyDown={onKeyDown} className="flex flex-wrap gap-1.5">
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 border px-3 text-[13px] font-medium transition-[background-color,border-color,color,transform,translate,scale] duration-150 ease-out active:scale-[0.97]",
              active
                ? "border-border-strong bg-surface-3 text-text"
                : "border-border text-text-muted hover:border-border-strong hover:text-text",
            )}
          >
            {o.label}
            <span className="text-text-subtle tabular-nums">{o.count}</span>
          </button>
        );
      })}
    </div>
  );
}
