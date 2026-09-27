"use client";

import { useEffect, type ReactNode } from "react";
import { Activity } from "lucide-react";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { TickerMark } from "@/components/shared/ticker-mark";
import { HOLDINGS, PORTFOLIO_TOTAL } from "@/data/portfolio";
import { scenarioTotals } from "@/data/shock";
import { useShockData } from "@/features/shock/model-context";
import { scenarioIn } from "@/features/shock/use-shock-model";
import { useShock } from "@/features/shock/store";
import { formatPct, formatSignedPct, formatSignedUSD } from "@/lib/format";
import { usePolicy } from "@/lib/experience/store";
import { cn } from "@/lib/utils";
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
  const policy = usePolicy();
  const model = useShockData();
  useEvidenceSync(model);

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

  const scenario = scenarioIn(model, scenarioId);
  const totals = scenarioTotals(scenario, severity, model.total);
  const modeled = scenario.impacts.map((i) => i.ticker);
  // Demo: share of value in modeled holdings. Live: share of look-through value that has a sensitivity.
  const modeledShare =
    model.modeledShare[scenario.id] ?? HOLDINGS.filter((h) => modeled.includes(h.ticker)).reduce((s, h) => s + h.value, 0) / PORTFOLIO_TOTAL;
  const notModeled = model.notModeled[scenario.id] ?? scenario.notModeled.map((ticker) => ({ ticker, weight: null as number | null }));

  return (
    <aside aria-label="Shock Test results" className="flex flex-col gap-4 xl:sticky xl:top-[72px] xl:self-start">
      <Card title="Portfolio impact">
        <p className={cn("display text-[64px] leading-none tabular-nums", totals.dollar < 0 ? "text-negative" : "text-positive")}>
          <AnimatedNumber value={totals.pct} from={0} format={(v) => formatSignedPct(v)} />
        </p>
        <p className={cn("mt-2 text-[16px] font-medium", totals.dollar < 0 ? "text-negative" : "text-positive")}>
          <AnimatedNumber value={totals.dollar} from={0} format={(v) => formatSignedUSD(v)} />
        </p>
        <p className="mt-1 text-[13px] text-text-muted">at {shortLabelAt(scenario.shortLabel, severity)}</p>

        <div className="mt-5">
          <div className="h-1 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent" style={{ width: `${modeledShare * 100}%` }} />
          </div>
          <p className="mt-2 text-[12px] text-text-muted tabular-nums">
            {modeled.length} of {model.positions} holdings modeled · {formatPct(modeledShare)} of value
          </p>
        </div>

        <p className="mt-4 text-[13px] leading-5 text-text-muted">
          {policy.level === "beginner"
            ? "This is an estimate of how your holdings could move if this happened. It isn't a prediction."
            : "Modeled from assumed sensitivities at this size. Not a forecast."}
        </p>
      </Card>

      <Card title="Top hits">
        <TopHits scenario={scenario} severity={severity} colors={model.colors} />
      </Card>

      <Card title="Not modeled">
        <ul className="flex flex-wrap gap-2">
          {notModeled.map(({ ticker, weight }) => (
            <li
              key={ticker}
              className="inline-flex h-7 items-center gap-2 rounded-full bg-surface-2 pr-3 pl-0.5 text-[12px] font-medium text-text-muted"
            >
              <TickerMark ticker={ticker} color={model.colors[ticker]} size={24} />
              {ticker}
              {weight !== null ? <span className="font-normal text-text-subtle tabular-nums">{formatPct(weight)}</span> : null}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] leading-5 text-text-muted">
          {notModeled.length === 0 ? "Every holding has a modeled path. " : "No modeled path from this scenario. "}
          {model.mode === "live"
            ? "The headline covers modeled exposures only: fixed company or sector sensitivities at the base severity, scaled linearly."
            : "The headline covers modeled holdings only."}
        </p>
      </Card>
    </aside>
  );
}
