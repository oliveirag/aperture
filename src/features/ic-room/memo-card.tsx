"use client";

import type { ReactNode, Ref } from "react";
import { motion } from "motion/react";
import { SourceChip } from "@/components/shared/source-chip";
import { formatSourceDate } from "@/components/shared/source-drawer";
import { GLOSSARY } from "@/data/glossary";
import type { MemoPoint } from "@/data/ic-room";
import { useLevel } from "@/lib/level";
import { cn } from "@/lib/utils";
import { STATUS } from "./assumption-card";
import { EASE_OUT, useAnimated } from "./enter";
import { FactRef, factPayload } from "./fact-ref";
import { FitTable } from "./fit-table";
import { useIcData } from "./run-data";

const KEY_TERMS = ["thesis", "investment committee", "concentration"] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[12px] font-medium tracking-[0.04em] text-text-subtle uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Points({ points, showRefs }: { points: readonly MemoPoint[]; showRefs: boolean }) {
  return (
    <ul className="flex flex-col gap-2">
      {points.map((p) => (
        <li key={p.text} className="flex gap-2.5 text-[15px] leading-6 text-text">
          <span aria-hidden className="mt-[11px] size-1 shrink-0 rounded-full bg-text-subtle" />
          <span>
            {p.text}
            {showRefs
              ? p.refs.map((r) => (
                  <span key={r} className="ml-1.5">
                    <FactRef id={r} />
                  </span>
                ))
              : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Plain({ items }: { items: readonly string[] }) {
  return <Points points={items.map((text) => ({ text, refs: [] }))} showRefs={false} />;
}

// The payoff: a one-page investment committee memo. Only the summary, key terms and citations depend on level.
export function MemoCard({ ref }: { ref?: Ref<HTMLElement> }) {
  const level = useLevel((s) => s.level);
  const motionOn = useAnimated();
  const { ticker, date, memo, assumptions, facts } = useIcData();
  const showRefs = true;

  return (
    // scroll-mt-30 leaves room for the top bar plus the 24px the memo is still rising when it scrolls into view.
    <motion.article
      ref={ref}
      aria-label="Investment committee memo"
      initial={motionOn ? { opacity: 0, transform: "translateY(24px)" } : false}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
      className="relative w-full max-w-[760px] scroll-mt-30 rounded-2xl border border-border bg-surface-2 p-6 sm:p-8"
    >
      <span aria-hidden className="absolute inset-x-8 top-0 h-px bg-accent/60" />
      {motionOn ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-2xl border border-accent/60 shadow-[0_0_32px_color-mix(in_srgb,var(--accent)_18%,transparent)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 0.6, delay: 0.35, ease: "easeOut" }}
        />
      ) : null}

      <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[12px] font-medium tracking-[0.04em] text-text-subtle uppercase">Chair</p>
          <h2 className="mt-1 text-[20px] leading-7 font-medium tracking-[-0.01em] text-text">
            Investment Committee Memo · {ticker.ticker} · {formatSourceDate(date)}
          </h2>
        </div>
        <span className="inline-flex h-7 shrink-0 items-center self-start border border-accent/70 px-3 text-[13px] font-medium text-accent">
          {memo.stance}
        </span>
      </header>

      <div className="flex flex-col gap-8 pt-6">
        <Section title="Summary">
          <p key={level} className="text-[15px] leading-6 text-pretty text-text animate-in fade-in duration-200">
            {memo.summary[level]}
          </p>
          <p className="text-[14px] leading-[22px] text-text-muted">{memo.chairNote}</p>
        </Section>

        {level === "beginner" ? (
          <aside aria-label="Key terms" className="bg-surface-1 p-4">
            <p className="mb-3 text-[12px] font-medium tracking-[0.04em] text-text-subtle uppercase">Key terms</p>
            <dl className="flex flex-col gap-2.5 text-[14px] leading-[22px]">
              {KEY_TERMS.map((term) => (
                <div key={term}>
                  <dt className="inline font-medium text-text capitalize">{term}. </dt>
                  <dd className="inline text-text-muted">{GLOSSARY[term]}</dd>
                </div>
              ))}
            </dl>
          </aside>
        ) : null}

        {assumptions.length > 0 ? (
          <Section title="What must be true">
            <ul className="flex flex-col gap-2">
              {assumptions.map((a) => {
                const { icon: Icon, label, tone } = STATUS[a.status];
                return (
                  <li key={a.id} className="flex items-start gap-2.5 text-[15px] leading-6 text-text">
                    <Icon className={cn("mt-1 size-4 shrink-0", tone)} aria-label={label} />
                    <span>
                      {a.text} <span className="text-[13px] text-text-subtle">{label}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : null}

        <div className="grid gap-8 md:grid-cols-2">
          <Section title="Bull case">
            <Points points={level === "beginner" ? memo.bull.slice(0, 2) : memo.bull} showRefs={showRefs} />
          </Section>
          <Section title="Bear case">
            <Points points={level === "beginner" ? memo.bear.slice(0, 2) : memo.bear} showRefs={showRefs} />
          </Section>
          <Section title="Key risks">
            <Plain items={memo.keyRisks} />
          </Section>
          <Section title="What to watch">
            <Plain items={memo.watch} />
          </Section>
        </div>

        <Section title="Portfolio fit">
          <FitTable />
        </Section>

        <Section title="Sources">
          <div className="flex flex-wrap gap-2">
            {facts.map((f) => (
              <SourceChip key={f.id} payload={factPayload(facts, f.id)!} label={`${f.id} · ${f.title}`} />
            ))}
          </div>
        </Section>
        {level === "advanced" && <Section title="Evidence audit"><p className="text-[13px] text-text-muted">Compare each argument with its underlying evidence. Citations identify the input; the bull and bear interpretations remain analysis.</p>{facts.map(f => <details key={f.id} className="border-t border-border pt-3"><summary className="cursor-pointer text-[14px]">{f.id} · {f.title}</summary><p className="mt-2 text-[14px] leading-6">{f.excerpt}</p><a href={f.url} target="_blank" rel="noreferrer" className="text-[13px] text-accent underline">Open original source</a></details>)}</Section>}
      </div>

      <footer className="mt-8 border-t border-border pt-4 text-[12px] text-text-subtle">
        Educational tool. Not investment advice.
      </footer>
    </motion.article>
  );
}
