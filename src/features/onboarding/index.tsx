"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleArrow } from "@/components/shared/circle-arrow";
import { Wordmark } from "@/components/shared/lens-mark";
import { MaskLine, Reveal } from "@/components/shared/reveal";
import { useLevel, type Level } from "@/lib/level";
import { cn } from "@/lib/utils";
import { LevelOptions } from "./level-options";
import { StepIndicator } from "./step-indicator";

export function Onboarding() {
  const router = useRouter();
  const setLevel = useLevel((s) => s.setLevel);
  const [choice, setChoice] = useState<Level | null>(null);

  function next() {
    if (!choice) return;
    setLevel(choice);
    router.push("/import");
  }

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="bx-container flex h-24 items-center justify-between gap-6 lg:h-[132px]">
        <Link href="/" aria-label="Lookthrough home">
          <Wordmark size="sm" className="sm:hidden" />
          <Wordmark className="hidden sm:inline-flex" />
        </Link>
        <StepIndicator current={1} />
      </header>

      <section className="bx-container flex flex-1 flex-col pt-10 pb-24 lg:pt-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
          <h1 className="display text-[44px] leading-[1.08] text-text sm:text-[64px]">
            <MaskLine>What&apos;s your</MaskLine>
            <MaskLine delay={0.1}>investing experience?</MaskLine>
          </h1>
          <Reveal delay={0.35} className="lg:pb-3">
            <p className="max-w-[34ch] text-[20px] leading-[1.5] font-light text-text">
              This changes how much we explain. The numbers stay the same.
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.5} className="mt-16">
          <LevelOptions value={choice} onChange={setChoice} />
        </Reveal>

        <div className="mt-12 flex flex-col gap-6 border-t border-border pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[14px] text-text-muted">You can switch levels anytime from the masthead.</p>
          <button
            type="button"
            onClick={next}
            disabled={!choice}
            className={cn(
              "group inline-flex items-center gap-4 text-[18px] font-normal transition-opacity duration-200",
              choice ? "text-text" : "cursor-not-allowed text-text-subtle",
            )}
          >
            <span className={cn(choice && "link-underline", "pb-1")}>Continue</span>
            <CircleArrow className={cn(!choice && "group-hover:bg-transparent group-hover:text-text-subtle")} />
          </button>
        </div>
      </section>
    </main>
  );
}
