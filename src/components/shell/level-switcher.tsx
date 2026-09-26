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

// Text radio group. A 1px rule glides under the active level on a critically damped spring (no overshoot).
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
    <div role="radiogroup" aria-label="Experience level" onKeyDown={onKeyDown} className="flex items-center gap-5">
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
              "relative py-1 text-[14px] transition-colors duration-200 ease-out",
              active ? "font-normal text-text" : "font-light text-text-muted hover:text-text",
            )}
          >
            {l.label}
            {active ? (
              <motion.span
                layoutId="level-rule"
                aria-hidden
                className="absolute inset-x-0 -bottom-px h-px bg-text"
                transition={{ type: "spring", bounce: 0, duration: 0.25 }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
