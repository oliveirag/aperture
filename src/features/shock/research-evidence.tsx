"use client";
import { useLevel } from "@/lib/level";
import { useShock } from "./store";
import { useResearch } from "./research-store";
import { useShockData } from "./model-context";

export function ResearchEvidence() {
  const result = useResearch(s => s.result);
  const scenarioId = useShock(s => s.scenarioId);
  const severity = useShock(s => s.severity);
  const level = useLevel(s => s.level);
  const model = useShockData();
  if (!result || scenarioId !== "researched" || !model.scenarios.some(s => s.id === "researched")) return null;
  return <section aria-label="Scenario evidence and assumptions" className="space-y-4 border border-border bg-surface-1 p-5 text-[14px] leading-6">
    <h2 className="text-[18px] text-text">Evidence and assumptions</h2>
    <p className="text-text-muted">{result.question}</p>
    <p><strong>How we read it:</strong> {result.plan.basis === "stated" ? "You named the driver and direction, so we modeled exactly that." : "You described an event, not a market driver. Reading it as the driver below is an assumption, not a finding."}{result.plan.rationale ? <span className="text-text-muted"> Basis: {result.plan.rationale}.</span> : null}{!result.plan.magnitudeStated ? <span className="text-text-muted"> The size is a default; use the severity control.</span> : null}</p>
    <p className="text-text-muted">{result.evidenceMode === "web" ? `Web research retrieved ${new Date(result.researchedAt).toLocaleString()}. Summaries below link to their supporting sources.` : "Reference sources only. Live web search is unavailable right now; these references explain the mechanism and do not establish current events."}</p>
    {result.evidence.map((claim, i) => <div key={i}>
      <p>{claim.text}</p>
      <div className="flex flex-wrap gap-x-4">{claim.sources.map(s => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-4">{s.title}</a>)}</div>
    </div>)}
    <p><strong>Assumption:</strong> {result.assumption.replace(`${result.result.scenario.baseSeverity}%`, `${severity}%`)}</p>
    {level === "beginner" ? <p>Follow the graph from the event to the business effect and then your holdings. A source supports the economic link; the percentage impact comes from our assumptions.</p> : <p>Calculation: holding value × exposed share × assumed sensitivity × signed driver change. ETF sectors exclude already counted named companies. Unmodeled exposure is unknown, not zero risk.</p>}
    {level !== "beginner" && <table className="w-full text-left text-[13px]"><caption className="text-left text-text-muted">Illustrative stock-return sensitivity per 1% increase in the driver</caption><thead><tr><th className="py-2">Sector</th><th>Assumed response</th></tr></thead><tbody>{result.sensitivities.map(s => <tr key={s.group} className="border-t border-border"><td className="py-2">{s.group}</td><td>{s.coefficient > 0 ? "+" : ""}{s.coefficient}%</td></tr>)}</tbody></table>}
    {level === "advanced" && <details><summary className="cursor-pointer">Inspect every modeled holding and path</summary><table className="mt-3 w-full text-left text-[13px]"><thead><tr><th>Holding</th><th>Scenario return</th><th>Dollar effect</th></tr></thead><tbody>{result.result.scenario.impacts.map(i => <tr key={i.ticker}><td className="py-2">{i.ticker}</td><td>{(i.baseReturn * severity / result.result.scenario.baseSeverity * 100).toFixed(2)}%</td><td>${(i.baseDollar * severity / result.result.scenario.baseSeverity).toFixed(2)}</td></tr>)}</tbody></table></details>}
  </section>;
}
