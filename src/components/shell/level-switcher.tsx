"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { motion } from "motion/react";
import type { Level } from "@/lib/experience/policy";
import { useExperience } from "@/lib/experience/store";
import { cn } from "@/lib/utils";

const LEVELS: { value: Level; label: string; hint: string }[] = [
  { value: "beginner", label: "Beginner", hint: "Plain words, the key points first, definitions inline" },
  { value: "intermediate", label: "Intermediate", hint: "Comparisons, what changed, a research checklist" },
  { value: "advanced", label: "Advanced", hint: "Full tables, assumptions and calculations open" },
];

// Text radio group. A 1px rule glides under the active level on a critically damped spring (no overshoot).
// Changing level only changes how much detail starts open; the numbers never change.
export function LevelSwitcher() {
  const level = useExperience((s) => s.level);
  const setLevel = useExperience((s) => s.setLevel);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [announce, setAnnounce] = useState("");

  function choose(next: Level) {
    if (next === level) return;
    setLevel(next);
    const l = LEVELS.find((x) => x.value === next)!;
    setAnnounce(`Showing ${l.label} detail. ${l.hint}. The numbers are the same.`);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = LEVELS.findIndex((l) => l.value === level);
    const next = (i + (e.key === "ArrowRight" ? 1 : LEVELS.length - 1)) % LEVELS.length;
    choose(LEVELS[next].value);
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
            title={l.hint}
            tabIndex={active ? 0 : -1}
            onPointerDown={() => choose(l.value)}
            onClick={() => choose(l.value)}
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
      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
