"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { TickerMark } from "@/components/shared/ticker-mark";

// Canonical demo values (GUI-39). GUI-48 may swap these for canon imports.
const POSITIONS = [
  { ticker: "NVDA", kind: "Direct", value: "$19,800", color: "#76B900" },
  { ticker: "QQQ", kind: "ETF", value: "$31,500", color: "#7FB8A4" },
  { ticker: "VOO", kind: "ETF", value: "$42,000", color: "#8FA3BF" },
] as const;
const NVIDIA_PCT = 17.6;

// Geometry: three 64px cards with 24px gaps -> centers at 32, 120, 208; the result sits at 120.
const CARD_H = 64;
const GAP = 24;
const HEIGHT = CARD_H * 3 + GAP * 2;
const MID = HEIGHT / 2;
const LINE_W = 120;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const INSTANT = { duration: 0 } as const;

function connector(i: number) {
  const y = CARD_H / 2 + i * (CARD_H + GAP);
  return `M0,${y} C${LINE_W * 0.5},${y} ${LINE_W * 0.5},${MID} ${LINE_W},${MID}`;
}

// The landing's single orchestrated moment: three holdings resolve into one company. Plays once, ≤ 1.8s.
export function LookthroughIllustration() {
  const reduce = useReducedMotion();
  // Reduced motion: same first paint as the server (no hydration mismatch), then jump straight to the final frame.
  const still = Boolean(reduce);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setPct(NVIDIA_PCT), reduce ? 0 : 1200);
    return () => clearTimeout(t);
  }, [reduce]);

  return (
      <div
        role="img"
        aria-label="NVIDIA reaches you through NVDA directly, QQQ and VOO: 17.6% of your money across 3 positions."
        className="rounded-2xl border border-border bg-surface-1 p-6 sm:p-8"
      >
        <div className="flex flex-col gap-6 sm:grid sm:grid-cols-[188px_120px_minmax(0,1fr)] sm:items-center sm:gap-0">
          <ul className="flex flex-col" style={{ gap: GAP }}>
            {POSITIONS.map((p, i) => (
              <motion.li
                key={p.ticker}
                initial={{ opacity: 0, transform: "translateY(6px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                transition={still ? INSTANT : { duration: 0.3, delay: i * 0.08, ease: EASE_OUT }}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3"
                style={{ height: CARD_H }}
              >
                <TickerMark ticker={p.ticker} color={p.color} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="text-[14px] font-semibold text-text">{p.ticker}</span>
                    <span className="text-[13px] text-text tabular-nums">{p.value}</span>
                  </p>
                  <p className="text-[12px] text-text-muted">{p.kind}</p>
                </div>
              </motion.li>
            ))}
          </ul>

          <svg
            aria-hidden
            viewBox={`0 0 ${LINE_W} ${HEIGHT}`}
            width={LINE_W}
            height={HEIGHT}
            className="hidden overflow-visible sm:block"
          >
            {POSITIONS.map((p, i) => (
              <motion.path
                key={p.ticker}
                d={connector(i)}
                fill="none"
                stroke="var(--border-strong)"
                strokeWidth={1.5}
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={still ? INSTANT : { duration: 0.6, delay: 0.4 + i * 0.08, ease: EASE_OUT }}
              />
            ))}
            {/* Once drawn, the direct line lights up: the position you knew about is only part of the story. */}
            <motion.path
              d={connector(0)}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={1.5}
              strokeLinecap="round"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={still ? INSTANT : { duration: 0.3, delay: 1.05 }}
            />
          </svg>

          <motion.div
            initial={{ opacity: 0, transform: "scale(0.96)" }}
            animate={{ opacity: 1, transform: "scale(1)" }}
            transition={still ? INSTANT : { duration: 0.35, delay: 1.2, ease: EASE_OUT }}
            className="rounded-xl border border-accent/40 bg-surface-2 px-5 py-4 sm:ml-2"
          >
            <p className="flex items-center gap-2 text-[14px] font-semibold text-text">
              <TickerMark ticker="NVDA" color="#76B900" size={24} />
              NVIDIA
            </p>
            <p className="mt-3 text-[36px] leading-none font-semibold tracking-[-0.03em] text-text">
              <AnimatedNumber value={pct} format={(v) => `${v.toFixed(1)}%`} duration={600} />
            </p>
            <p className="mt-1.5 text-[13px] text-text-muted">of your money</p>
            <p className="mt-3 inline-flex rounded-full border border-border-strong px-2 py-0.5 text-[12px] text-text-muted">
              3 positions
            </p>
          </motion.div>
        </div>
      </div>
  );
}
