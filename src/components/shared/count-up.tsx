"use client";

import { useRef } from "react";
import { useInView } from "motion/react";
import { formatPct } from "@/lib/format";
import { AnimatedNumber } from "./animated-number";

// A percentage that counts up once, when it first scrolls into view.
// AnimatedNumber handles reduced motion (it jumps straight to the value).
export function CountUpPct({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -80px 0px" });
  return (
    <span ref={ref} className={className}>
      <AnimatedNumber value={inView ? value : 0} from={0} format={formatPct} duration={1200} />
    </span>
  );
}
