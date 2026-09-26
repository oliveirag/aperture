"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";

// Remounts on every shell navigation: a 150ms opacity cross-fade instead of a hard cut. Opacity only, so no layout shift.
export default function AppTemplate({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}
