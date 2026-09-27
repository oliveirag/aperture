import type { ShockScenario, Source } from "@/types/demo";
import type { ScenarioTable } from "./sensitivities";
import type { LiveScenario } from "./live";

export type Driver = "oil" | "import-costs";
export type ResearchPlan = { driver: Driver; direction: 1 | -1; severity: number };
export type ResearchEvidence = { text: string; sources: { title: string; url: string }[] };
export type ResearchResult = {
  question: string;
  researchedAt: string;
  evidenceMode: "web" | "reference";
  evidence: ResearchEvidence[];
  assumption: string;
  sensitivities: { group: string; coefficient: number }[];
  table: ScenarioTable;
  result: LiveScenario;
  portfolioKey: string;
};

export const portfolioKey = (rows: { ticker: string; shares: number; price: number }[]) =>
  JSON.stringify(rows.map(({ ticker, shares, price }) => [ticker, shares, price]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));

// References explain the economic mechanism. They do not estimate equity returns.
export const REFERENCES: Record<Driver, ResearchEvidence> = {
  oil: {
    text: "The EIA identifies Hormuz as a major oil transit chokepoint. A supply disruption is a reason to examine oil-price exposure; it does not establish the size or duration of a price move.",
    sources: [{ title: "EIA: World Oil Transit Chokepoints", url: "https://www.eia.gov/international/content/analysis/special_topics/World_Oil_Transit_Chokepoints/" }],
  },
  "import-costs": {
    text: "The USITC's retrospective study of 2018–2021 tariffs found that US importers bore nearly their full cost. Applying that mechanism to a future policy change is a scenario assumption, not a finding about a future election.",
    sources: [{ title: "USITC: Economic impact of Section 232 and 301 tariffs (2023)", url: "https://www.usitc.gov/press_room/news_release/2023/er0315_63679.htm" }],
  },
};

export function knownPlan(question: string): ResearchPlan | null {
  const oil = /\b(oil|hormuz|crude)\b/i.test(question);
  const tariff = /\b(tariff|tariffs|import costs?)\b/i.test(question);
  if (oil === tariff) return null; // Do not silently collapse combined or unknown shocks.
  const down = /\b(down|fall|falls|lower|lowered|cut|cuts|decrease|decreases|drop|drops|reopen|reopens)\b/i.test(question);
  const up = /\b(up|rise|rises|higher|increase|increases|close|closes|closure|block|blocks)\b/i.test(question);
  if (!down && !up) return null;
  if (down && up) return null;
  const magnitude = question.match(/(\d+(?:\.\d+)?)\s*%/);
  const severity = magnitude ? Number(magnitude[1]) : oil ? 20 : 10;
  if (!Number.isFinite(severity) || severity < 1 || severity > 60 || /percentage points?|\bbps\b/i.test(question)) return null;
  return { driver: oil ? "oil" : "import-costs", direction: down && !up ? -1 : 1, severity };
}

export function researchScenario(plan: ResearchPlan, evidence: ResearchEvidence[]): {
  base: ShockScenario; table: ScenarioTable; assumption: string; sensitivities: ResearchResult["sensitivities"];
} {
  const oil = plan.driver === "oil";
  const driver = oil ? "Oil price" : "Import costs";
  const change = plan.direction > 0 ? "increase" : "decrease";
  const sources: Source[] = evidence.flatMap((claim, i) => claim.sources.map((source, j) => ({
    id: `research-${i}-${j}`, title: source.title, issuer: new URL(source.url).hostname,
    date: "", docType: "News" as const, section: "Research summary, not a verbatim quotation",
    excerpt: claim.text, url: source.url,
  })));
  if (!sources.length) throw new Error("No supporting sources");
  const sourceId = sources[0].id;
  const groups = oil
    ? [{ group: "Energy", coefficient: 0.5, label: "Producer revenues" }, { group: "Industrials", coefficient: -0.15, label: "Fuel and transport costs" }, { group: "Consumer Discretionary", coefficient: -0.1, label: "Consumer spending pressure" }]
    : [{ group: "Technology", coefficient: -0.25, label: "Imported hardware costs" }, { group: "Consumer Discretionary", coefficient: -0.3, label: "Imported goods costs" }, { group: "Industrials", coefficient: -0.15, label: "Imported inputs" }];
  const table: ScenarioTable = { channels: [], entities: {}, sectors: {} };
  for (const [i, g] of groups.entries()) {
    const channel = `research-channel-${i}`;
    table.channels.push({ id: channel, label: g.label, sublabel: "Illustrative sector sensitivity", weight: Math.abs(g.coefficient), method: "ASSUMPTION", sourceId });
    table.sectors[g.group] = { channel, ret: g.coefficient * plan.direction * plan.severity / 100, sourceId };
  }
  // Known classifications permit direct holdings when a company profile is unavailable.
  const entities: Record<string, string> = {
    XOM: "Energy", CVX: "Energy", COP: "Energy", OXY: "Energy", SLB: "Energy",
    AAPL: "Technology", NVDA: "Technology", AMD: "Technology", AVGO: "Technology", TSM: "Technology",
    AMZN: "Consumer Discretionary", TSLA: "Consumer Discretionary", NKE: "Consumer Discretionary", HD: "Consumer Discretionary",
    DAL: "Industrials", UAL: "Industrials", AAL: "Industrials", UPS: "Industrials", FDX: "Industrials", CAT: "Industrials",
  };
  for (const [ticker, sector] of Object.entries(entities)) {
    const rule = table.sectors[sector];
    if (rule) table.entities[ticker] = { ...rule, sector, kind: "Illustrative sector sensitivity" };
  }
  const assumption = `Assume a ${plan.severity}% ${change} in ${driver.toLowerCase()}. Sector sensitivities are illustrative settings chosen for this stress test, not measured stock forecasts. An election or supply interruption does not determine this magnitude. No time horizon or event probability is estimated.`;
  const headline = `Under a {severity}% ${change} in ${driver.toLowerCase()}, the modeled portfolio change is {pct} ({usd}).`;
  return {
    assumption, table, sensitivities: groups.map(({ group, coefficient }) => ({ group, coefficient })),
    base: {
      id: "researched", label: `${driver} ${change}`, shortLabel: `${driver} ${plan.direction > 0 ? "+" : "−"}${plan.severity}%`,
      description: assumption, baseSeverity: plan.severity, minSeverity: 1, maxSeverity: 60,
      severityLabel: `${driver.toLowerCase()} ${change} (assumption)`, keywords: [],
      nodes: [{ id: "research-driver", kind: "driver", label: `${driver} ${change}`, sublabel: "Hypothetical", x: 110, y: 280 }],
      edges: [], impacts: [], notModeled: [], sources,
      headline: { beginner: headline, intermediate: headline, advanced: headline },
    },
  };
}
