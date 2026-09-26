"use client";

import { useRef, type KeyboardEvent } from "react";
import { motion } from "motion/react";
import { useLevel, type Level } from "@/lib/level";
import { cn } from "@/lib/utils";

const LEVELS: { value: Level; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

// Segmented radio group. The pill glides between options with a critically damped spring (no overshoot).
export function LevelSwitcher() {
  const level = useLevel((s) => s.level);
  const setLevel = useLevel((s) => s.setLevel);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = LEVELS.findIndex((l) => l.value === level);
    const next = (i + (e.key === "ArrowRight" ? 1 : LEVELS.length - 1)) % LEVELS.length;
    setLevel(LEVELS[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Experience level"
      onKeyDown={onKeyDown}
      className="flex h-8 items-center gap-0.5 rounded-lg border border-border bg-surface-1 p-0.5"
    >
      {LEVELS.map((l, i) => {
        const active = l.value === level;
        return (
          <button
            key={l.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onPointerDown={() => setLevel(l.value)}
            onClick={() => setLevel(l.value)}
            className={cn(
              "relative h-full rounded-md px-2.5 text-[12px] font-medium transition-colors duration-150 ease-out",
              active ? "text-text" : "text-text-muted hover:text-text",
            )}
          >
            {active ? (
              <motion.span
                layoutId="level-pill"
                aria-hidden
                className="absolute inset-0 rounded-md bg-surface-3 shadow-[inset_0_0_0_1px_var(--border)]"
                transition={{ type: "spring", bounce: 0, duration: 0.25 }}
              />
            ) : null}
            <span className="relative">{l.label}</span>
          </button>
        );
      })}
    </div>
  );
}
