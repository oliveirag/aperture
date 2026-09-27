"use client";

import Link from "next/link";
import { CircleArrow } from "@/components/shared/circle-arrow";
import { useShock } from "@/features/shock/store";
import { cn } from "@/lib/utils";

// Every demo run starts from a clean Shock Test.
// "primary" is the editorial call to action (label + circle arrow); "nav" is a plain masthead link.
export function TryDemoLink({ variant = "primary", className }: { variant?: "primary" | "nav"; className?: string }) {
  return (
    <Link
      href="/onboarding"
      onClick={() => useShock.getState().reset()}
      className={cn(
        "group inline-flex items-center whitespace-nowrap text-text",
        variant === "primary" ? "gap-4 text-[18px] font-normal" : "text-[17px] font-light",
        className,
      )}
    >
      <span className="link-underline pb-1">Get started</span>
      {variant === "primary" ? <CircleArrow /> : null}
    </Link>
  );
}
