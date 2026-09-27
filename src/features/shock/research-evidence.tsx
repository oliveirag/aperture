"use client";
import { ShowMore } from "@/components/shared/disclosure";
import { Term } from "@/components/shared/term";
import { useDisclosure } from "@/lib/experience/disclosure";
import { usePolicy } from "@/lib/experience/store";
import { formatSignedPct, formatSignedUSD } from "@/lib/format";
import { useShock } from "./store";
import { useResearch } from "./research-store";
import { useShockData } from "./model-context";

// Evidence, assumptions and the calculation for a researched scenario. The evidence, the assumption and the unknown
// share are shown at every level; the sensitivity table and per-holding table start open or collapsed by level.
export function ResearchEvidence() {
  const result = useResearch(s => s.result);
  const scenarioId = useShock(s => s.scenarioId);
  const severity = useShock(s => s.severity);
  const policy = usePolicy();
  const [sensitivitiesOpen, setSensitivities] = useDisclosure("shock-sensitivities", policy.shock.sensitivities);
  const [holdingsOpen, setHoldings] = useDisclosure("shock-holdings-table", policy.shock.holdingsTable);
  const model = useShockData();
  if (!result || scenarioId !== "researched" || !model.scenarios.some(s => s.id === "researched")) return null;
  const scale = severity / result.result.scenario.baseSeverity;
  return <section aria-label="Scenario evidence and assumptions" className="space-y-4 border border-border bg-surface-1 p-5 text-[14px] leading-6">
    <h2 className="text-[18px] text-text">Evidence and assumptions</h2>
    <p className="text-text-muted">{result.question}</p>
    <p><strong>How we read it:</strong> {result.plan.basis === "stated" ? "You named the driver and direction, so we modeled exactly that." : "You described an event, not a market driver. Reading it as the driver below is an assumption, not a finding."}{result.plan.rationale ? <span className="text-text-muted"> Basis: {result.plan.rationale}.</span> : null}{!result.plan.magnitudeStated ? <span className="text-text-muted"> The size is a default; use the severity control.</span> : null}</p>
    <p className="text-text-muted">{result.evidenceMode === "web" ? `Web research retrieved ${new Date(result.researchedAt).toLocaleString()}. Summaries below link to their supporting sources; quoted passages are copied from the companies' latest 10-K filings.` : result.evidenceMode === "filing" ? "Quoted passages are copied from the companies' latest 10-K filings on SEC EDGAR and describe how each company says this driver affects it. They explain the mechanism and do not establish current events." : "Reference sources only. Live web search is unavailable right now; these references explain the mechanism and do not establish current events."}</p>
    {result.evidence.map((claim, i) => <div key={i}>
      <p>{claim.text}</p>
      <div className="flex flex-wrap gap-x-4">{claim.sources.map(s => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-4">{s.title}</a>)}</div>
    </div>)}
    <p><strong>Assumption:</strong> {result.assumption.replace(`${result.result.scenario.baseSeverity}%`, `${severity}%`)}</p>
    <p className="text-text-muted">Modeled share of the portfolio: {Math.round(result.result.modeledShare * 100)}%. {result.result.notModeled.length ? `No modeled path: ${result.result.notModeled.map(n => n.ticker).join(", ")}. Their exposure is unknown, not zero.` : ""}</p>
    <div>
      <ShowMore open={sensitivitiesOpen} onToggle={() => setSensitivities(!sensitivitiesOpen)} more="Show the assumed sensitivities" less="Hide the assumed sensitivities" controls="shock-sensitivities" />
      {sensitivitiesOpen && <table id="shock-sensitivities" className="mt-2 w-full text-left text-[13px]"><caption className="text-left text-text-muted">Illustrative <Term term="sensitivity">stock-return sensitivity</Term> per 1% increase in the driver</caption><thead><tr><th scope="col" className="py-2">Sector</th><th scope="col">Assumed response</th></tr></thead><tbody>{result.sensitivities.map(s => <tr key={s.group} className="border-t border-border"><td className="py-2">{s.group}</td><td>{s.coefficient > 0 ? "+" : ""}{s.coefficient}%</td></tr>)}</tbody></table>}
    </div>
    <div>
      <ShowMore open={holdingsOpen} onToggle={() => setHoldings(!holdingsOpen)} more="Show every modeled holding" less="Hide the holding table" controls="shock-holdings-table" />
      {holdingsOpen && <table id="shock-holdings-table" className="mt-2 w-full text-left text-[13px]"><caption className="sr-only">Modeled effect by holding at {severity}%</caption><thead><tr><th scope="col" className="py-2">Holding</th><th scope="col">Path</th><th scope="col">Scenario return</th><th scope="col">Dollar effect</th></tr></thead><tbody>{result.result.scenario.impacts.map(i => <tr key={i.ticker} className="border-t border-border"><td className="py-2">{i.ticker}</td><td className="text-text-muted">{i.pathLabel}</td><td className="tabular-nums">{formatSignedPct(i.baseReturn * scale, 2)}</td><td className="tabular-nums">{formatSignedUSD(i.baseDollar * scale, 2)}</td></tr>)}</tbody></table>}
    </div>
  </section>;
}
