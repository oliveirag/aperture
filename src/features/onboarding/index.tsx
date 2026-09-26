"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { Wordmark } from "@/components/shared/lens-mark";
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
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="mx-auto flex min-h-dvh max-w-[1200px] flex-col px-6 sm:px-8"
    >
      <header className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className="rounded-md">
          <Wordmark />
        </Link>
        <StepIndicator current={1} />
      </header>

      <section className="flex flex-1 flex-col items-center justify-center py-16">
        <h1 className="text-center text-[32px] leading-[1.1] font-semibold tracking-[-0.02em] text-text sm:text-[40px]">
          What&apos;s your investing experience?
        </h1>
        <p className="mt-3 text-center text-[16px] text-text-muted">
          This changes how much we explain. The numbers stay the same.
        </p>

        <div className="mt-12 flex w-full justify-center">
          <LevelOptions value={choice} onChange={setChoice} />
        </div>

        <button
          type="button"
          onClick={next}
          disabled={!choice}
          className={cn(
            "group mt-10 inline-flex h-11 w-[220px] items-center justify-center gap-2 rounded-lg text-[15px] font-medium transition-[transform,background-color,color,opacity] duration-150 ease-out",
            choice ? "bg-text text-bg hover:bg-white active:scale-[0.97]" : "cursor-not-allowed bg-surface-2 text-text-subtle",
          )}
        >
          Continue
          <ArrowRight aria-hidden className="size-4 transition-transform duration-200 ease-out group-enabled:group-hover:translate-x-0.5" />
        </button>
        <p className="mt-4 text-[13px] text-text-subtle">You can switch levels anytime from the top bar.</p>
      </section>
    </motion.main>
  );
}
