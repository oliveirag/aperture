"use client";

import { useRef, type KeyboardEvent } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export type ImportMode = "screenshot" | "csv" | "manual";

const MODES: { value: ImportMode; label: string }[] = [
  { value: "screenshot", label: "Screenshot" },
  { value: "csv", label: "CSV / Excel" },
  { value: "manual", label: "Type it in" },
];

// Text radio group matching the level switcher: a 1px rule glides under the active method.
export function ModeSwitch({ mode, disabled, onChange }: { mode: ImportMode; disabled: boolean; onChange: (m: ImportMode) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (disabled || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
    e.preventDefault();
    const i = MODES.findIndex((m) => m.value === mode);
    const next = (i + (e.key === "ArrowRight" ? 1 : MODES.length - 1)) % MODES.length;
    onChange(MODES[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Import method" onKeyDown={onKeyDown} className="flex items-center gap-6">
      {MODES.map((m, i) => {
        const active = m.value === mode;
        return (
          <button
            key={m.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled && !active}
            onClick={() => onChange(m.value)}
            className={cn(
              "relative py-1 text-[15px] transition-colors duration-200 ease-out disabled:opacity-40",
              active ? "font-normal text-text" : "font-light text-text-muted hover:text-text",
            )}
          >
            {m.label}
            {active ? (
              <motion.span
                layoutId="import-mode-rule"
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
