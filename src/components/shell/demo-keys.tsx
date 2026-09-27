"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useShock } from "@/features/shock/store";
import { LEVELS } from "@/lib/experience/policy";
import { useExperience } from "@/lib/experience/store";
import { usePortfolio } from "@/lib/portfolio-store";

const ROUTES: Record<string, string> = { Digit1: "/xray", Digit2: "/shock", Digit3: "/radar", Digit4: "/ic" };

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest("input, textarea, select, [contenteditable='true']") !== null;
}

// Presenter shortcuts, active only on the demo portfolio so they never change a real user's saved preference.
// Matches on e.code because macOS turns Alt+1 into "¡".
export function DemoKeys() {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.repeat || isTyping(e.target)) return;
      if (usePortfolio.getState().imported) return;

      const route = ROUTES[e.code];
      if (route) {
        e.preventDefault();
        router.push(route);
        return;
      }

      if (e.code === "KeyL") {
        e.preventDefault();
        const { level, setLevel } = useExperience.getState();
        setLevel(LEVELS[(LEVELS.indexOf(level) + 1) % LEVELS.length]);
        return;
      }

      if (e.code === "KeyR") {
        e.preventDefault();
        useShock.getState().reset();
        useExperience.getState().setLevel("intermediate");
        router.push("/");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return null;
}
