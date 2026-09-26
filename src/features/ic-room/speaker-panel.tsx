"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useEnter } from "./enter";

const SPEAKERS = {
  bull: { name: "Bull analyst", role: "Argues for the thesis", color: "var(--chart-3)" },
  bear: { name: "Bear analyst", role: "Rebuts the bull case", color: "var(--chart-4)" },
} as const;

// One side of the debate. Before its turn the panel waits; then the statement types out with a caret.
export function SpeakerPanel({
  side,
  text,
  chars,
  entered,
}: {
  side: keyof typeof SPEAKERS;
  text: string;
  chars: number;
  entered: boolean;
}) {
  const enter = useEnter();
  const s = SPEAKERS[side];
  const typing = entered && chars < text.length;
  const thinking = entered && chars === 0;

  return (
    <motion.section
      aria-label={s.name}
      {...enter}
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-xl border bg-surface-1 p-4 transition-[border-color] duration-200",
        typing ? "border-border-strong" : "border-border",
      )}
      style={typing ? { borderColor: `color-mix(in srgb, ${s.color} 45%, transparent)` } : undefined}
    >
      <header className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="flex size-7 items-center justify-center rounded-full text-[13px] font-semibold"
          style={{ color: s.color, backgroundColor: `color-mix(in srgb, ${s.color} 16%, transparent)` }}
        >
          {s.name[0]}
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold" style={{ color: s.color }}>
            {s.name}
          </p>
          <p className="text-[12px] text-text-subtle">{s.role}</p>
        </div>
      </header>

      {/* The full text reserves the final height so the panel never jumps while typing. */}
      <div className="relative text-[15px] leading-6">
        <p aria-hidden className="invisible">
          {text}
        </p>
        <p className="absolute inset-0 text-text">
          {!entered ? <span className="text-text-subtle">Waiting for the bull case…</span> : null}
          {thinking ? <span className="text-text-subtle">Thinking…</span> : null}
          {text.slice(0, chars)}
          {typing && !thinking ? (
            <span
              aria-hidden
              className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-pulse"
              style={{ backgroundColor: s.color }}
            />
          ) : null}
        </p>
      </div>
    </motion.section>
  );
}
