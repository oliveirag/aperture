"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useShock } from "@/features/shock/store";
import { cn } from "@/lib/utils";

// Every demo run starts from a clean Shock Test.
export function TryDemoLink({ variant = "primary", className }: { variant?: "primary" | "nav"; className?: string }) {
  return (
    <Link
      href="/onboarding"
      onClick={() => useShock.getState().reset()}
      className={cn(
        "group inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.97]",
        variant === "primary"
          ? "h-11 rounded-lg bg-text px-5 text-[15px] text-bg hover:-translate-y-px hover:bg-white"
          : "h-8 rounded-lg border border-border-strong px-3 text-[13px] text-text hover:bg-surface-2",
        className,
      )}
    >
      Try the demo
      {variant === "primary" ? (
        <ArrowRight aria-hidden className="size-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
      ) : null}
    </Link>
  );
}
