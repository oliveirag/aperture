"use client";

import { motion } from "motion/react";

// Seconds per top-to-bottom pass; two passes fill the scripted scan.
export const SWEEP_S = 1.2;

// A glowing accent line that sweeps the drop zone twice. The track is full height, so y: 100% is the bottom edge.
export function ScanOverlay() {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      initial={{ y: "0%" }}
      animate={{ y: "100%" }}
      transition={{ duration: SWEEP_S, ease: "easeInOut", repeat: 1 }}
    >
      <div className="h-[2px] w-full bg-accent shadow-[0_0_24px_4px_color-mix(in_srgb,var(--accent)_35%,transparent)]" />
    </motion.div>
  );
}
