"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useExperience } from "@/lib/experience/store";

// Someone who arrived by a direct link never chose a level: say which one is showing and how to change it, once.
export function LevelNotice() {
  const show = useExperience((s) => s.hydrated && !s.onboarded && !s.noticeDismissed && s.chosenAt === null);
  const dismiss = useExperience((s) => s.dismissNotice);
  if (!show) return null;
  return (
    <div role="status" className="border-b border-border bg-surface-1">
      <div className="bx-container flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-[14px]">
        <span className="min-w-0 flex-1 text-text-muted">
          Showing Intermediate detail. Switch levels in the masthead, or{" "}
          <Link href="/onboarding" className="text-text underline underline-offset-4">
            choose how much we explain
          </Link>
          . The numbers are the same at every level.
        </span>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="inline-flex size-8 items-center justify-center text-text-muted hover:text-text">
          <X aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  );
}
