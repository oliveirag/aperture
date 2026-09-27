"use client";

import { useState } from "react";
import { scenarioTotals } from "@/data/shock";
import { formatSignedPct, formatSignedUSD } from "@/lib/format";
import { usePolicy } from "@/lib/experience/store";
import type { ScenarioId, ShockScenario } from "@/types/demo";
import { useShockData } from "./model-context";

// Pure: several scenarios at their own severities, side by side. Uses the same linear scaling as the headline, so a
// row here always equals running that scenario on its own.
export function compareScenarios(scenarios: ShockScenario[], severities: Partial<Record<ScenarioId, number>>, total: number) {
  return scenarios.map((s) => {
    const severity = severities[s.id] ?? s.baseSeverity;
    const totals = scenarioTotals(s, severity, total);
    const biggest = [...s.impacts].sort((a, b) => Math.abs(b.baseDollar) - Math.abs(a.baseDollar))[0];
    return { id: s.id, label: s.label, severity, min: s.minSeverity, max: s.maxSeverity, unit: s.severityLabel, ...totals, biggest: biggest?.ticker ?? null, modeled: s.impacts.length };
  });
}

// Every available scenario in one table, each with its own size. Assumed sensitivities; not forecasts.
export function ScenarioCompare() {
  const model = useShockData();
  const policy = usePolicy();
  const [severities, setSeverities] = useState<Partial<Record<ScenarioId, number>>>({});
  const rows = compareScenarios(model.scenarios, severities, model.total);
  const digits = policy.precision.pct;

  return (
    <section aria-labelledby="scenario-compare" className="border border-border bg-surface-1 p-5">
      <h2 id="scenario-compare" className="text-[18px] text-text">Compare scenarios</h2>
      <p className="mt-1 text-[13px] text-text-muted">
        Each row uses the same look-through exposures and its own assumed sensitivities, scaled linearly with size. Unmodeled holdings are
        unknown, not zero.
      </p>
      <div className="-mx-2 mt-4 overflow-x-auto">
        <table className="w-full min-w-[620px] text-[14px]">
          <caption className="sr-only">Portfolio effect of each scenario at the chosen size</caption>
          <thead>
            <tr className="border-b border-border text-[11px] tracking-[0.06em] text-text-muted uppercase">
              <th scope="col" className="h-8 px-2 text-left font-medium">Scenario</th>
              <th scope="col" className="h-8 px-2 text-left font-medium">Size (assumption)</th>
              <th scope="col" className="h-8 px-2 text-right font-medium">Portfolio effect</th>
              <th scope="col" className="h-8 px-2 text-right font-medium">Dollars</th>
              <th scope="col" className="h-8 px-2 text-right font-medium">Largest hit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-b-0">
                <th scope="row" className="px-2 py-3 text-left font-normal text-text">{r.label}</th>
                <td className="px-2 py-3">
                  <label className="flex items-center gap-2 text-[13px] text-text-muted">
                    <input
                      type="range"
                      min={r.min}
                      max={r.max}
                      step={1}
                      value={r.severity}
                      onChange={(e) => setSeverities((s) => ({ ...s, [r.id]: Number(e.target.value) }))}
                      aria-label={`${r.label} size in percent`}
                      aria-valuetext={`${r.severity}% ${r.unit}`}
                      className="h-1 w-28 cursor-pointer accent-accent"
                    />
                    <span className="tabular-nums text-text">{r.severity}%</span> {r.unit}
                  </label>
                </td>
                <td className={r.pct < 0 ? "px-2 text-right tabular-nums text-negative" : "px-2 text-right tabular-nums text-positive"}>{formatSignedPct(r.pct, digits)}</td>
                <td className="px-2 text-right tabular-nums text-text-muted">{formatSignedUSD(r.dollar, policy.precision.usd)}</td>
                <td className="px-2 text-right text-text-muted">{r.biggest ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
