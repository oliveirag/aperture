"use client";

import { createContext, useContext } from "react";
import { useReducedMotion } from "motion/react";

export const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// True after "Skip to memo": everything mounts in its final state, no enter animations.
export const InstantContext = createContext(false);

// Enter props for a fade + rise. Reduced motion fades only; instant renders the final state.
export function useEnter(rise = 8, duration = 0.25) {
  const reduce = useReducedMotion();
  const instant = useContext(InstantContext);
  return {
    initial: instant ? (false as const) : reduce ? { opacity: 0 } : { opacity: 0, transform: `translateY(${rise}px)` },
    animate: { opacity: 1, transform: "translateY(0px)" },
    transition: { duration, ease: EASE_OUT },
  };
}

export function useAnimated() {
  const reduce = useReducedMotion();
  const instant = useContext(InstantContext);
  return !reduce && !instant;
}
