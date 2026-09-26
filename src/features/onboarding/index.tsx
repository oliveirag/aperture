"use client";

import { useState } from "react";
import { ArrowLeft, Briefcase, Sprout } from "lucide-react";
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
  // Beginners get a second question: do they own anything yet? (PRD 3.0)
  const [asking, setAsking] = useState(false);

  function next() {
    if (!choice) return;
    setLevel(choice);
    if (choice === "beginner") setAsking(true);
    else router.push("/import");
  }

  if (asking) return <OwnsQuestion onBack={() => setAsking(false)} onPick={(href) => router.push(href)} />;

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

const OWNS = [
  {
    href: "/import",
    title: "Yes, I own some",
    body: "Import a screenshot, CSV export or a quick list of what you hold, and see what's really inside.",
    icon: Briefcase,
  },
  {
    href: "/practice",
    title: "Not yet",
    body: "Build a practice portfolio with pretend money and real prices. Nothing is bought.",
    icon: Sprout,
  },
] as const;

function OwnsQuestion({ onBack, onPick }: { onBack: () => void; onPick: (href: string) => void }) {
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
            <MaskLine>Do you own any</MaskLine>
            <MaskLine delay={0.1}>investments yet?</MaskLine>
          </h1>
          <Reveal delay={0.35} className="lg:pb-3">
            <p className="max-w-[34ch] text-[20px] leading-[1.5] font-light text-text">
              Either way works. Practicing first is how most good investors start.
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.5} className="mt-16">
          <div className="grid w-full gap-4 md:grid-cols-2">
            {OWNS.map((o) => {
              const Icon = o.icon;
              return (
                <button
                  key={o.href}
                  type="button"
                  onClick={() => onPick(o.href)}
                  className="group flex min-h-[220px] flex-col items-start bg-surface-1 p-8 text-left transition-[background-color,transform] duration-300 ease-out hover:bg-surface-2 active:scale-[0.99]"
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
            Change experience level
          </button>
        </div>
      </section>
    </main>
  );
}
