"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PageHeader } from "@/components/shared/page-header";
import { Term } from "@/components/shared/term";
import type { RadarCard as RadarCardData, Severity } from "@/data/radar";
import { useLevel, type Level } from "@/lib/level";
import { cn } from "@/lib/utils";
import { CoverageRail } from "./coverage-rail";
import { RadarCard } from "./radar-card";
import { SeverityFilter, type FilterValue } from "./severity-filter";
import { useRadar, type PendingCompany } from "./use-radar";

const RECHECK_MS = 1200;

function defaultExpanded(level: Level, cards: RadarCardData[]): string[] {
  if (level === "advanced") return cards.map((c) => c.id);
  if (level === "intermediate" && cards[0]) return [cards[0].id];
  return [];
}

const possessive = (name: string) => (name.endsWith("s") ? `${name}'` : `${name}'s`);

// One row per company still being read, narrating the work; failed ones offer a retry.
function PendingRow({ company, onRetry }: { company: PendingCompany; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-3 bg-surface-1 px-5 py-4 text-[14px]">
      {company.error ? (
        <>
          <AlertTriangle aria-hidden className="size-4 shrink-0 text-sev-medium" />
          <span className="min-w-0 flex-1 text-text">
            {company.name}: {company.error}
          </span>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-text-muted hover:bg-surface-2 hover:text-text"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Retry
          </button>
        </>
      ) : (
        <>
          <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin text-accent" />
          <span className="text-text-muted">
            Reading {possessive(company.name)} last two 10-Ks and comparing their risk factors…
          </span>
        </>
      )}
    </div>
  );
}

export function RadarPage() {
  const level = useLevel((s) => s.level);
  const reduce = useReducedMotion();
  const view = useRadar();
  const [filter, setFilter] = useState<FilterValue>("all");
  const [expanded, setExpanded] = useState<{ level: Level; ids: string[] } | null>(null);
  const [demoChecking, setDemoChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (view.mode === "loading") {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <p className="eyebrow">Filing Radar</p>
        <div className="h-[360px] animate-pulse bg-surface-1" />
      </div>
    );
  }
  if (view.mode === "xray-error") {
    return (
      <div className="flex flex-col gap-6">
        <p className="eyebrow">Filing Radar</p>
        <p className="text-[18px] font-light text-text">Couldn&apos;t load your portfolio ({view.error}).</p>
        <button type="button" onClick={view.retry} className="self-start text-[14px] font-medium text-text underline underline-offset-4">
          Try again
        </button>
      </div>
    );
  }

  const live = view.mode === "live";
  const checking = live ? view.checking : demoChecking;

  // Each level has its own reading depth: re-apply the default expansion when the level changes.
  const open = expanded && expanded.level === level ? expanded.ids : defaultExpanded(level, view.cards);

  // Beginners see high and medium only.
  const pool = view.cards.filter((c) => level !== "beginner" || c.severity !== "low");
  const counts: Partial<Record<Severity, number>> = {};
  for (const c of pool) counts[c.severity] = (counts[c.severity] ?? 0) + 1;

  const activeFilter: FilterValue = filter !== "all" && !counts[filter] ? "all" : filter;
  const cards = pool.filter((c) => activeFilter === "all" || c.severity === activeFilter);

  const options: { value: FilterValue; label: string; count: number }[] = [
    { value: "all", label: "All", count: pool.length },
    ...(["high", "medium", "low"] as const)
      .filter((s) => counts[s])
      .map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1), count: counts[s] ?? 0 })),
  ];

  function toggle(id: string) {
    const ids = open.includes(id) ? open.filter((x) => x !== id) : [...open, id];
    setExpanded({ level, ids });
  }

  function recheck() {
    setChecked(false);
    if (live) {
      view.recheck();
      setChecked(true);
      return;
    }
    setDemoChecking(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setDemoChecking(false);
      setChecked(true);
    }, RECHECK_MS);
  }

  // Hold one steady headline until every company is read, instead of re-announcing a partial count per card.
  const done = !live || view.pending.every((p) => p.error);
  const reading = view.pending.length + view.cards.length + (live ? view.others.length : 0);
  const headline = done ? view.headline[level] : `Reading the latest 10-Ks of the ${reading} companies you own most…`;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Filing Radar"
        headline={headline}
        subline={
          <>
            We compare each company&apos;s latest <Term term="10-K">10-K</Term> with the prior one and flag new or changed{" "}
            <Term term="risk factor">risk factors</Term>.{live ? " Every quote is checked word for word against the filing on SEC.gov." : ""}
          </>
        }
      />

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,760px)_280px] xl:justify-between">
        <section aria-label="Filing changes" aria-live="polite" className="flex min-w-0 flex-col gap-4">
          {pool.length > 0 ? <SeverityFilter options={options} value={activeFilter} onChange={setFilter} /> : null}

          <div className="relative">
            <div className={cn("flex flex-col gap-4 transition-opacity duration-200 ease-out", checking && !live && "opacity-60")}>
              {cards.map((card, i) => (
                <RadarCard
                  key={card.id}
                  card={card}
                  index={i}
                  expanded={open.includes(card.id)}
                  onToggle={() => toggle(card.id)}
                  onRefresh={live ? () => view.refreshOne(card.ticker) : undefined}
                  refreshing={live && view.refreshing(card.ticker)}
                />
              ))}
              {live
                ? view.pending.map((p) => <PendingRow key={p.ticker} company={p} onRetry={() => view.refreshOne(p.ticker)} />)
                : null}
              {live && done && view.cards.length === 0 ? (
                <p className="bg-surface-1 px-5 py-6 text-[14px] text-text-muted">
                  No material risk-factor changes in the companies you own. The companies we checked are listed on the right.
                </p>
              ) : null}
            </div>

            <AnimatePresence>
              {checking && !live && !reduce ? (
                <motion.div
                  aria-hidden
                  key="sweep"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
                >
                  <motion.div
                    className="absolute inset-y-0 w-1/2 bg-[linear-gradient(100deg,transparent,rgba(255,255,255,0.06),transparent)]"
                    initial={{ transform: "translateX(-100%)" }}
                    animate={{ transform: "translateX(200%)" }}
                    transition={{ duration: RECHECK_MS / 1000, ease: "linear" }}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </section>

        <CoverageRail
          counts={counts}
          filings={live ? view.reviewed : pool.length}
          checking={checking}
          checked={checked}
          onRecheck={recheck}
          highExposure={view.highExposure}
          lastChecked={view.lastChecked}
          others={view.others}
          checkedMessage={live ? "Re-read the latest filings from SEC.gov." : undefined}
        />
      </div>
    </div>
  );
}
