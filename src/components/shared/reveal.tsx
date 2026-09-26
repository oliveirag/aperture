"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

const EASE_EDITORIAL = [0.22, 1, 0.36, 1] as const;

// Editorial scroll reveal: content rises 24px and fades in once, as it enters the viewport.
// Slow on purpose (it's read once, like a magazine page turning); reduced motion gets a plain fade.
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(24px)" }}
      whileInView={reduce ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px)" }}
      viewport={{ once: true, margin: "0px 0px -80px 0px" }}
      transition={{ duration: reduce ? 0.3 : 0.9, delay, ease: EASE_EDITORIAL }}
    >
      {children}
    </motion.div>
  );
}

// A display line that slides up from behind its own baseline mask, like a title card.
export function MaskLine({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <span className={`block overflow-hidden pb-[0.12em] ${className ?? ""}`}>
      <motion.span
        className="block"
        initial={reduce ? { opacity: 0 } : { transform: "translateY(105%)" }}
        animate={reduce ? { opacity: 1 } : { transform: "translateY(0%)" }}
        transition={{ duration: reduce ? 0.3 : 1.1, delay, ease: EASE_EDITORIAL }}
      >
        {children}
      </motion.span>
    </span>
  );
}
