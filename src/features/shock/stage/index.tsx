"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { PageHeader } from "@/components/shared/page-header";
import { getScenario, scenarioTotals } from "@/data/shock";
import { useShockData } from "@/features/shock/model-context";
import { scenarioIn } from "@/features/shock/use-shock-model";
import { useShock } from "@/features/shock/store";
import { useLevel } from "@/lib/level";
import type { ScenarioId } from "@/types/demo";
import { PropagationGraph } from "./propagation-graph";
import { ScenarioPicker } from "./scenario-picker";
import { SeverityControl } from "./severity-control";
import { ShockHeadline } from "./shock-headline";
import { ShockInput } from "./shock-input";
import { useRunTimeline } from "./timeline";
import { ResearchEvidence } from "../research-evidence";

const SCENARIO_IDS: ScenarioId[] = ["cre", "ai-capex"];

// The "watch it travel" half of the Shock Test. Reads and writes only the shared shock store.
export function ShockStage() {
  const scenarioId = useShock((s) => s.scenarioId);
  const severity = useShock((s) => s.severity);
  const hasRun = useShock((s) => s.hasRun);
  const setScenario = useShock((s) => s.setScenario);
  const setSeverity = useShock((s) => s.setSeverity);
  const level = useLevel((s) => s.level);
  const model = useShockData();
  const reduce = useReducedMotion() ?? false;
  const [runKey, setRunKey] = useState(() => (useShock.getState().hasRun ? 1 : 0));

  // Any run started through the store (here, the deep link, or elsewhere) replays the animation.
  useEffect(
    () =>
      useShock.subscribe((s, prev) => {
        if (s.hasRun && (!prev.hasRun || s.scenarioId !== prev.scenarioId)) setRunKey((k) => k + 1);
      }),
    [],
  );

  function run(id: ScenarioId, sev?: number) {
    const prev = useShock.getState();
    const scenario = scenarioIn(model, id);
    setScenario(id, scenario.baseSeverity);
    if (sev !== undefined && sev !== scenario.baseSeverity) setSeverity(sev);
    // Same scenario again: the store doesn't transition, so replay explicitly.
    if (prev.hasRun && prev.scenarioId === id) setRunKey((k) => k + 1);
  }

  // Deep link for the demo runbook: /shock?scenario=cre
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("scenario");
    if (id && (SCENARIO_IDS as string[]).includes(id)) {
      const scenario = getScenario(id as ScenarioId);
      useShock.getState().setScenario(scenario.id, scenario.baseSeverity);
    }
  }, []);

  const scenario = scenarioIn(model, scenarioId);
  const totals = scenarioTotals(scenario, severity, model.total);
  const timeline = useRunTimeline(scenario, hasRun ? runKey : 0, reduce);
  const answered = hasRun && timeline.headline;
  const countMs = timeline.done ? 250 : 500;

  return (
    <section aria-label="Shock Test" className="@container flex min-w-0 flex-col gap-5">
      <div className="min-h-[112px]">
        <PageHeader
          eyebrow="Shock Test"
          headline={
            answered ? (
              <span className="block text-[32px] leading-[1.2] sm:text-[36px]">
                <ShockHeadline
                  template={scenario.headline[level]}
                  severity={severity}
                  pct={totals.pct}
                  dollar={totals.dollar}
                  countMs={countMs}
                />
              </span>
            ) : (
              "What happens to your portfolio if…"
            )
          }
          subline={answered ? undefined : "Pick a scenario. We trace it through the companies you own, with a source on every link."}
        />
      </div>

      <div className="flex flex-col gap-3">
        <ScenarioPicker activeId={hasRun ? scenarioId : null} onRun={(id) => run(id)} />
        <ShockInput onRun={run} />
      </div>

      <div className="bg-surface-1 p-4">
        {hasRun ? (
          <div className="mb-2 border-b border-border px-1 pt-1 pb-3">
            <SeverityControl scenario={scenario} severity={severity} onChange={setSeverity} />
          </div>
        ) : null}
        <div className="-mx-1 overflow-x-auto px-1">
          <div className="min-w-[620px] md:min-w-0">
            <PropagationGraph
              scenario={scenario}
              severity={severity}
              hasRun={hasRun}
              runKey={runKey}
              ms={timeline.ms}
              done={timeline.done}
              reduce={reduce}
              level={level}
              colors={model.colors}
            />
          </div>
        </div>
      </div>

      {level === "beginner" ? (
        <p className="-mt-2 text-[13px] text-text-muted">
          Each line is one way the shock can reach your money. Click a line to see the source.
        </p>
      ) : null}
      <ResearchEvidence />
    </section>
  );
}
