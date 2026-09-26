"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PageHeader } from "@/components/shared/page-header";
import { Term } from "@/components/shared/term";
import { RADAR_CARDS, RADAR_HEADLINE, type Severity } from "@/data/radar";
import { useLevel, type Level } from "@/lib/level";
import { cn } from "@/lib/utils";
import { CoverageRail } from "./coverage-rail";
import { RadarCard } from "./radar-card";
import { SeverityFilter, type FilterValue } from "./severity-filter";

const RECHECK_MS = 1200;

function defaultExpanded(level: Level): string[] {
  if (level === "advanced") return RADAR_CARDS.map((c) => c.id);
  if (level === "intermediate") return [RADAR_CARDS[0].id];
  return [];
}

export function RadarPage() {
  const level = useLevel((s) => s.level);
  const reduce = useReducedMotion();
  const [filter, setFilter] = useState<FilterValue>("all");
  const [expanded, setExpanded] = useState(() => ({ level, ids: defaultExpanded(level) }));
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Each level has its own reading depth: re-apply the default expansion when the level changes.
  if (expanded.level !== level) setExpanded({ level, ids: defaultExpanded(level) });

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Beginners see high and medium only.
  const pool = RADAR_CARDS.filter((c) => level !== "beginner" || c.severity !== "low");
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
    setExpanded((prev) => ({
      level: prev.level,
      ids: prev.ids.includes(id) ? prev.ids.filter((x) => x !== id) : [...prev.ids, id],
    }));
  }

  function recheck() {
    setChecked(false);
    setChecking(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setChecking(false);
      setChecked(true);
    }, RECHECK_MS);
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Filing Radar"
        headline={RADAR_HEADLINE[level]}
        subline={
          <>
            We compare each company&apos;s latest <Term term="10-K">10-K</Term> or <Term term="10-Q">10-Q</Term> with
            the prior one and flag new or changed <Term term="risk factor">risk factors</Term>.
          </>
        }
      />

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,760px)_280px] xl:justify-between">
        <section aria-label="Filing changes" className="flex min-w-0 flex-col gap-4">
          <SeverityFilter options={options} value={activeFilter} onChange={setFilter} />

          <div className="relative">
            <div
              className={cn(
                "flex flex-col gap-4 transition-opacity duration-200 ease-out",
                checking && "opacity-60",
              )}
            >
              {cards.map((card, i) => (
                <RadarCard
                  key={card.id}
                  card={card}
                  index={i}
                  expanded={expanded.ids.includes(card.id)}
                  onToggle={() => toggle(card.id)}
                />
              ))}
            </div>

            <AnimatePresence>
              {checking && !reduce ? (
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
          filings={pool.length}
          checking={checking}
          checked={checked}
          onRecheck={recheck}
        />
      </div>
    </div>
  );
}
