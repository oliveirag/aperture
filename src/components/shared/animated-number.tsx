"use client";

import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

type AnimatedNumberProps = {
  value: number;
  format: (n: number) => string;
  duration?: number; // ms
  from?: number; // count from this value on mount (e.g. 0); defaults to value (no mount animation)
  className?: string;
};

// Tweens from whatever is on screen right now to the new value, so rapid changes (a slider) never jump.
export function AnimatedNumber({ value, format, duration = 600, from, className }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(from ?? value);
  const formatRef = useRef(format);
  const reduce = useReducedMotion();

  useEffect(() => {
    formatRef.current = format;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce || shown.current === value) {
      shown.current = value;
      el.textContent = formatRef.current(value);
      return;
    }
    const controls = animate(shown.current, value, {
      duration: duration / 1000,
      ease: [0.23, 1, 0.32, 1],
      onUpdate: (v) => {
        shown.current = v;
        el.textContent = formatRef.current(v);
      },
    });
    return () => controls.stop();
  }, [value, duration, reduce]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {format(from ?? value)}
    </span>
  );
}
