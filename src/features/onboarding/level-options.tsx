"use client";

import { useRef, type KeyboardEvent } from "react";
import { Check, LineChart, Microscope, Sprout, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Level } from "@/lib/level";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Level; title: string; body: string; icon: LucideIcon }[] = [
  { value: "beginner", title: "Beginner", body: "I haven't bought my first stock yet, or I just started.", icon: Sprout },
  { value: "intermediate", title: "Intermediate", body: "I own a few stocks or ETFs and check on them sometimes.", icon: LineChart },
  { value: "advanced", title: "Advanced", body: "I read earnings and filings and follow valuation.", icon: Microscope },
];

// Native radio semantics: arrow keys move and select, Space/Enter select, one tab stop for the group.
export function LevelOptions({ value, onChange }: { value: Level | null; onChange: (l: Level) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusIndex = value ? OPTIONS.findIndex((o) => o.value === value) : 0;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    const current = OPTIONS.findIndex((o) => o.value === value);
    const from = current === -1 ? (forward ? -1 : 0) : current;
    const next = (from + (forward ? 1 : OPTIONS.length - 1)) % OPTIONS.length;
    onChange(OPTIONS[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Investing experience"
      onKeyDown={onKeyDown}
      className="grid w-full gap-4 md:grid-cols-3"
    >
      {OPTIONS.map((o, i) => {
        const selected = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={i === focusIndex ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              // The chosen level inverts into a black band, the way the site marks emphasis.
              "relative flex min-h-[260px] flex-col items-start p-8 text-left transition-[background-color,color,transform,translate,scale] duration-300 ease-out active:scale-[0.99]",
              selected ? "theme-light" : "bg-surface-1 hover:bg-surface-2",
            )}
          >
            <span className="flex w-full items-center justify-between">
              <span className="display text-[40px] leading-none text-text tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <Icon
                aria-hidden
                strokeWidth={1.25}
                className={cn("size-6 text-text-muted transition-opacity duration-150", selected && "opacity-0")}
              />
            </span>
            <span className="display mt-auto pt-10 text-[30px] leading-tight text-text">{o.title}</span>
            <span className="mt-2 text-[16px] leading-[1.55] text-text-muted">{o.body}</span>

            <AnimatePresence>
              {selected ? (
                <motion.span
                  aria-hidden
                  initial={{ opacity: 0, transform: "scale(0.9)" }}
                  animate={{ opacity: 1, transform: "scale(1)" }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                  className="absolute top-8 right-8 inline-flex size-6 items-center justify-center rounded-full bg-text text-bg"
                >
                  <Check className="size-3.5" strokeWidth={3} />
                </motion.span>
              ) : null}
            </AnimatePresence>
          </button>
        );
      })}
    </div>
  );
}
