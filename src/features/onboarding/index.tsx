"use client";

import { useState } from "react";
import { ArrowLeft, Briefcase, FlaskConical, Sprout } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleArrow } from "@/components/shared/circle-arrow";
import { Wordmark } from "@/components/shared/lens-mark";
import { MaskLine, Reveal } from "@/components/shared/reveal";
import type { Level } from "@/lib/experience/policy";
import { useExperience } from "@/lib/experience/store";
import { usePortfolio } from "@/lib/portfolio-store";
import { cn } from "@/lib/utils";
import { LevelOptions } from "./level-options";
import { StepIndicator } from "./step-indicator";

// Two questions, both for everyone: how much explanation you want, then what to look at. Nothing about goals, wealth or
// risk tolerance is asked; the level only sets which details start open and can be changed anytime.
export function Onboarding() {
  const router = useRouter();
  const setLevel = useExperience((s) => s.setLevel);
  const finishOnboarding = useExperience((s) => s.finishOnboarding);
  const current = useExperience((s) => (s.chosenAt ? s.level : null));
  const [choice, setChoice] = useState<Level | null>(null);
  const [asking, setAsking] = useState(false);
  const picked = choice ?? current;

  function next() {
    if (!picked) return;
    setLevel(picked);
    setAsking(true);
  }

  function skip() {
    setAsking(true);
  }

  function pick(href: string) {
    finishOnboarding();
    if (href === "demo") {
      usePortfolio.getState().resetToDemo();
      router.push("/xray");
    } else router.push(href);
  }

  if (asking) return <OwnsQuestion onBack={() => setAsking(false)} onPick={pick} />;

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="bx-container flex h-24 items-center justify-between gap-6 lg:h-[132px]">
        <Link href="/" aria-label="Aperture home">
          <Wordmark size="sm" className="sm:hidden" />
          <Wordmark className="hidden sm:inline-flex" />
        </Link>
        <StepIndicator current={1} />
      </header>

      <section className="bx-container flex flex-1 flex-col pt-10 pb-24 lg:pt-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
          <h1 className="display text-[44px] leading-[1.08] text-text sm:text-[64px]">
            <MaskLine>How much should</MaskLine>
            <MaskLine delay={0.1}>we explain?</MaskLine>
          </h1>
          <Reveal delay={0.35} className="lg:pb-3">
            <p className="max-w-[34ch] text-[20px] leading-[1.5] font-light text-text">
              This sets how much detail starts open. The numbers stay the same, and every detail is one tap away at any level.
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.5} className="mt-16">
          <LevelOptions value={picked} onChange={setChoice} />
        </Reveal>

        <div className="mt-12 flex flex-col gap-6 border-t border-border pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[14px] text-text-muted">
            You can switch anytime from the masthead.{" "}
            <button type="button" onClick={skip} className="underline underline-offset-4 hover:text-text">
              Skip for now
            </button>{" "}
            (shows Intermediate detail).
          </p>
          <button
            type="button"
            onClick={next}
            disabled={!picked}
            className={cn(
              "group inline-flex items-center gap-4 text-[18px] font-normal transition-opacity duration-200",
              picked ? "text-text" : "cursor-not-allowed text-text-subtle",
            )}
          >
            <span className={cn(picked && "link-underline", "pb-1")}>Continue</span>
            <CircleArrow className={cn(!picked && "group-hover:bg-transparent group-hover:text-text-subtle")} />
          </button>
        </div>
      </section>
    </main>
  );
}

const OWNS = [
  {
    href: "/import",
    title: "My portfolio",
    body: "Import a screenshot, a CSV or Excel export, or a quick list of what you hold, and see what's really inside.",
    icon: Briefcase,
  },
  {
    href: "/practice",
    title: "A practice portfolio",
    body: "Don't own anything yet? Build one with pretend money and real prices. Nothing is bought.",
    icon: Sprout,
  },
  {
    href: "demo",
    title: "The demo portfolio",
    body: "A dated example portfolio of seven holdings, to see how Aperture works first.",
    icon: FlaskConical,
  },
] as const;

function OwnsQuestion({ onBack, onPick }: { onBack: () => void; onPick: (href: string) => void }) {
  return (
    <main className="flex min-h-dvh flex-col">
      <header className="bx-container flex h-24 items-center justify-between gap-6 lg:h-[132px]">
        <Link href="/" aria-label="Aperture home">
          <Wordmark size="sm" className="sm:hidden" />
          <Wordmark className="hidden sm:inline-flex" />
        </Link>
        <StepIndicator current={1} />
      </header>

      <section className="bx-container flex flex-1 flex-col pt-10 pb-24 lg:pt-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
          <h1 className="display text-[44px] leading-[1.08] text-text sm:text-[64px]">
            <MaskLine>What should</MaskLine>
            <MaskLine delay={0.1}>we look at?</MaskLine>
          </h1>
          <Reveal delay={0.35} className="lg:pb-3">
            <p className="max-w-[34ch] text-[20px] leading-[1.5] font-light text-text">
              Any of these works, and you can switch portfolios anytime from the masthead.
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.5} className="mt-16">
          <div className="grid w-full gap-4 md:grid-cols-3">
            {OWNS.map((o) => {
              const Icon = o.icon;
              return (
                <button
                  key={o.href}
                  type="button"
                  onClick={() => onPick(o.href)}
                  className="group flex min-h-[220px] flex-col items-start bg-surface-1 p-8 text-left transition-[background-color,transform,translate,scale] duration-300 ease-out hover:bg-surface-2 active:scale-[0.99]"
                >
                  <Icon aria-hidden strokeWidth={1.25} className="size-6 text-text-muted" />
                  <span className="display mt-auto pt-10 text-[30px] leading-tight text-text">{o.title}</span>
                  <span className="mt-2 max-w-[44ch] text-[16px] leading-[1.55] text-text-muted">{o.body}</span>
                </button>
              );
            })}
          </div>
        </Reveal>

        <div className="mt-12 border-t border-border pt-8">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-[15px] text-text-muted hover:text-text">
            <ArrowLeft aria-hidden className="size-4" />
            Change how much we explain
          </button>
        </div>
      </section>
    </main>
  );
}
