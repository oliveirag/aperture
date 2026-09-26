"use client";

import { useEffect, type ReactNode } from "react";
import { Activity } from "lucide-react";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { TickerMark } from "@/components/shared/ticker-mark";
import { HOLDINGS, PORTFOLIO_TOTAL } from "@/data/portfolio";
import { getScenario, scenarioTotals } from "@/data/shock";
import { useShock } from "@/features/shock/store";
import { formatPct, formatSignedPct, formatSignedUSD } from "@/lib/format";
import { useLevel } from "@/lib/level";
import { TopHits } from "./top-hits";
import { shortLabelAt, useEvidenceSync } from "./use-evidence-sync";

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="bg-surface-1 p-5">
      {title ? <h2 className="mb-3 text-[13px] font-medium text-text-muted">{title}</h2> : null}
      {children}
    </section>
  );
}

function EmptyState() {
  return (
    <Card>
      <Activity aria-hidden className="size-5 text-text-muted" />
      <p className="mt-3 text-[15px] font-medium text-text">Results appear here</p>
      <p className="mt-1 text-[13px] leading-5 text-text-muted">
        Pick a scenario on the left. Every number traces back to a source.
      </p>
      <div aria-hidden className="mt-5 flex flex-col gap-3 opacity-40">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="size-8 bg-surface-3" />
            <div className="h-3 flex-1 rounded-full bg-surface-3" />
            <div className="h-3 w-12 rounded-full bg-surface-3" />
          </div>
        ))}
      </div>
    </Card>
  );
}

// The "show me why" column of the Shock Test. Reads and writes only the shared shock store.
export function ShockImpact() {
  const hasRun = useShock((s) => s.hasRun);
  const scenarioId = useShock((s) => s.scenarioId);
  const severity = useShock((s) => s.severity);
  const level = useLevel((s) => s.level);
  useEvidenceSync();

  // Dev-only handle so the panel can be driven before the graph (GUI-44) lands.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") (window as unknown as { __shock?: typeof useShock }).__shock = useShock;
  }, []);

  if (!hasRun) {
    return (
      <aside aria-label="Shock Test results" className="flex flex-col gap-4 xl:sticky xl:top-[72px] xl:self-start">
        <EmptyState />
      </aside>
    );
  }

  const scenario = getScenario(scenarioId);
  const totals = scenarioTotals(scenario, severity);
  const modeled = scenario.impacts.map((i) => i.ticker);
  const modeledShare = HOLDINGS.filter((h) => modeled.includes(h.ticker)).reduce((s, h) => s + h.value, 0) / PORTFOLIO_TOTAL;

  return (
    <aside aria-label="Shock Test results" className="flex flex-col gap-4 xl:sticky xl:top-[72px] xl:self-start">
      <Card title="Portfolio impact">
        <p className="display text-[64px] leading-none text-negative tabular-nums">
          <AnimatedNumber value={totals.pct} from={0} format={(v) => formatSignedPct(v)} />
        </p>
        <p className="mt-2 text-[16px] font-medium text-negative">
          <AnimatedNumber value={totals.dollar} from={0} format={(v) => formatSignedUSD(v)} />
        </p>
        <p className="mt-1 text-[13px] text-text-muted">at {shortLabelAt(scenario.shortLabel, severity)}</p>

        <div className="mt-5">
          <div className="h-1 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent" style={{ width: `${modeledShare * 100}%` }} />
          </div>
          <p className="mt-2 text-[12px] text-text-muted tabular-nums">
            {modeled.length} of {HOLDINGS.length} holdings modeled · {formatPct(modeledShare)} of value
          </p>
        </div>

        {level === "beginner" ? (
          <p className="mt-4 text-[13px] leading-5 text-text-muted">
            This is an estimate of how much your holdings could fall if this happened. It isn&apos;t a prediction.
          </p>
        ) : null}
      </Card>

      <Card title="Top hits">
        <TopHits scenario={scenario} severity={severity} />
      </Card>

      <Card title="Not modeled">
        <ul className="flex flex-wrap gap-2">
          {scenario.notModeled.map((t) => (
            <li
              key={t}
              className="inline-flex h-7 items-center gap-2 rounded-full bg-surface-2 pr-3 pl-0.5 text-[12px] font-medium text-text-muted"
            >
              <TickerMark ticker={t} color={HOLDINGS.find((h) => h.ticker === t)?.color} size={24} />
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] leading-5 text-text-muted">
          No modeled path from this scenario. The headline covers modeled holdings only.
        </p>
      </Card>
    </aside>
  );
}
