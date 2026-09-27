"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { HIGH_SEVERITY_EXPOSURE, RADAR_CARDS, RADAR_HEADLINE, RADAR_LAST_CHECKED } from "@/data/radar";
import { ShowMore } from "@/components/shared/disclosure";
import { useDisclosure } from "@/lib/experience/disclosure";
import { usePolicy } from "@/lib/experience/store";
import { cn } from "@/lib/utils";
import { CoverageRail } from "./coverage-rail";
import { RadarHeader } from "./header";
import { RadarCard } from "./radar-card";
import { SeverityFilter, type FilterValue } from "./severity-filter";
import { feedView } from "./view";

const RECHECK_MS = 1200;

// The curated demo portfolio's Radar: four hand-checked cards (canon, see scripts/check-canon.ts).
export function DemoRadar() {
  const policy = usePolicy();
  const level = policy.level;
  const reduce = useReducedMotion();
  const [filter, setFilter] = useState<FilterValue>("all");
  const [showLow, setShowLow] = useDisclosure("radar-low", policy.radar.lowSeverity);
  const feed = feedView(RADAR_CARDS, policy, showLow || filter === "low");
  const [expanded, setExpanded] = useState(() => ({ level, ids: feed.expanded }));
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Each level has its own reading depth: re-apply the default expansion when the level changes.
  if (expanded.level !== level) setExpanded({ level, ids: feed.expanded });

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Counts always cover all four filings; Beginner folds the low-severity one behind a counted row.
  const counts = feed.counts;
  const activeFilter: FilterValue = filter !== "all" && !counts[filter] ? "all" : filter;
  const cards = feed.visible.filter((c) => activeFilter === "all" || c.severity === activeFilter);

  const options: { value: FilterValue; label: string; count: number }[] = [
    { value: "all", label: "All", count: RADAR_CARDS.length },
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
      <RadarHeader headline={RADAR_HEADLINE[level]} />

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
              {feed.collapsed.length > 0 && activeFilter === "all" ? (
                <div className="flex items-center justify-between gap-3 bg-surface-1 px-5 py-4 text-[14px] text-text-muted">
                  <span>
                    {feed.collapsed.length} lower-severity {feed.collapsed.length === 1 ? "change" : "changes"} ({feed.collapsed.map((c) => c.company).join(", ")})
                  </span>
                  <ShowMore open={false} onToggle={() => setShowLow(true)} more="Show" />
                </div>
              ) : null}
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
          filings={RADAR_CARDS.length}
          checking={checking}
          checked={checked}
          onRecheck={recheck}
          highExposure={HIGH_SEVERITY_EXPOSURE}
          lastChecked={RADAR_LAST_CHECKED}
          recheckLabel="Replay example feed"
          checkedMessage="Example replay complete. No live filing request was made."
        />
      </div>
    </div>
  );
}
