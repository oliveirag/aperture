"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useShock } from "@/features/shock/store";
import { useLevel, type Level } from "@/lib/level";

const ROUTES: Record<string, string> = { Digit1: "/xray", Digit2: "/shock", Digit3: "/radar", Digit4: "/ic" };
const LEVELS: Level[] = ["beginner", "intermediate", "advanced"];

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest("input, textarea, select, [contenteditable='true']") !== null;
}

// Presenter shortcuts. Matches on e.code because macOS turns Alt+1 into "¡".
export function DemoKeys() {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.repeat || isTyping(e.target)) return;

      const route = ROUTES[e.code];
      if (route) {
        e.preventDefault();
        router.push(route);
        return;
      }

      if (e.code === "KeyL") {
        e.preventDefault();
        const { level, setLevel } = useLevel.getState();
        setLevel(LEVELS[(LEVELS.indexOf(level) + 1) % LEVELS.length]);
        return;
      }

      if (e.code === "KeyR") {
        e.preventDefault();
        useShock.getState().reset();
        useLevel.getState().setLevel("intermediate");
        router.push("/");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return null;
}
