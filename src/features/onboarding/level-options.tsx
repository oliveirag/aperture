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
      className="grid w-full max-w-[1008px] gap-4 md:grid-cols-3"
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
              "relative flex min-h-[180px] flex-col items-start rounded-2xl border p-6 text-left transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.99]",
              selected ? "border-accent bg-surface-2" : "border-border bg-surface-1 hover:border-border-strong",
            )}
          >
            <span
              className={cn(
                "inline-flex size-9 items-center justify-center rounded-lg transition-colors duration-150",
                selected ? "bg-accent/15 text-accent" : "bg-surface-2 text-text-muted",
              )}
            >
              <Icon aria-hidden className="size-5" />
            </span>
            <span className="mt-auto pt-8 text-[17px] font-semibold text-text">{o.title}</span>
            <span className="mt-1 text-[14px] leading-[22px] text-text-muted">{o.body}</span>

            <AnimatePresence>
              {selected ? (
                <motion.span
                  aria-hidden
                  initial={{ opacity: 0, transform: "scale(0.9)" }}
                  animate={{ opacity: 1, transform: "scale(1)" }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                  className="absolute top-5 right-5 inline-flex size-5 items-center justify-center rounded-full bg-accent text-bg"
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
