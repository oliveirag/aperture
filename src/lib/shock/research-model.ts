import type { ShockScenario, Source } from "@/types/demo";
import type { ScenarioTable } from "./sensitivities";
import type { LiveScenario } from "./live";

export type Driver = "oil" | "import-costs" | "usd" | "chip-supply";
// basis: "stated" = the user named the driver and direction; "assumed" = proposed from cited sources, never a prediction.
export type PlanBasis = "stated" | "assumed";
export type ResearchPlan = { driver: Driver; direction: 1 | -1; severity: number; basis: PlanBasis; trigger: string; rationale?: string; magnitudeStated: boolean };
// `filing` marks a verbatim 10-K passage (from lib/shock/filing-evidence), shown as a filing source, not a summary.
export type ResearchEvidence = { text: string; sources: { title: string; url: string }[]; filing?: { issuer: string; form: "10-K"; filedAt: string; quote: string } };
export type ResearchResult = {
  question: string;
  researchedAt: string;
  // web: Gemini search with citations; filing: reference plus verbatim 10-K passages; reference: fixed references only.
  evidenceMode: "web" | "filing" | "reference";
  plan: { driver: Driver; basis: PlanBasis; trigger: string; rationale?: string; magnitudeStated: boolean };
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
export const REFERENCES: Partial<Record<Driver, ResearchEvidence>> = {
  oil: {
    text: "The EIA identifies Hormuz as a major oil transit chokepoint. A supply disruption is a reason to examine oil-price exposure; it does not establish the size or duration of a price move.",
    sources: [{ title: "EIA: World Oil Transit Chokepoints", url: "https://www.eia.gov/international/content/analysis/special_topics/World_Oil_Transit_Chokepoints/" }],
  },
  "import-costs": {
    text: "The USITC's retrospective study of 2018–2021 tariffs found that US importers bore nearly their full cost. Applying that mechanism to a future policy change is a scenario assumption, not a finding about a future election.",
    sources: [{ title: "USITC: Economic impact of Section 232 and 301 tariffs (2023)", url: "https://www.usitc.gov/press_room/news_release/2023/er0315_63679.htm" }],
  },
};


type Group = { label: string; sector?: string; coefficient: number };
type EntityRow = { group: number; sector: string; coefficient?: number };
type DriverSpec = {
  // keywords route a question to this driver; explicit marks words that name the driver itself (not an event such as "Hormuz").
  noun: string; unit: string; defaultSeverity: number; keywords: RegExp; explicit: RegExp; up: RegExp; down: RegExp;
  groups: Group[]; entities: Record<string, EntityRow>;
};
const DOWN = /\b(down|fall|falls|lower|lowered|cut|cuts|decrease|decreases|drop|drops|reopen|reopens|weaken|weakens|weaker|ease|eases|end|ends|removed?)\b/i;
const sectorNames = (list: string[], group: number, sector: string) => Object.fromEntries(list.map(t => [t, { group, sector }]));

// Sector sensitivities are stress-test assumptions (elasticity: % stock return per 1% driver change), never measured forecasts.
// Sources support the economic mechanism only.
export const DRIVERS: Record<Driver, DriverSpec> = {
  oil: {
    noun: "Oil price", unit: "oil price", defaultSeverity: 20,
    keywords: /\b(oil|hormuz|crude|opec)\b/i, explicit: /\b(oil|crude)\b/i, up: /\b(up|rise|rises|higher|increase|increases|close|closes|closure|block|blocks|spike|spikes|surge|surges)\b/i, down: DOWN,
    groups: [{ label: "Producer revenues", sector: "Energy", coefficient: 0.5 }, { label: "Fuel and transport costs", sector: "Industrials", coefficient: -0.15 }, { label: "Consumer spending pressure", sector: "Consumer Discretionary", coefficient: -0.1 }],
    entities: {
      ...sectorNames(["XOM", "CVX", "COP", "OXY", "SLB"], 0, "Energy"),
      ...sectorNames(["DAL", "UAL", "AAL", "UPS", "FDX", "CAT"], 1, "Industrials"),
      ...sectorNames(["AMZN", "TSLA", "NKE", "HD"], 2, "Consumer Discretionary"),
    },
  },
  "import-costs": {
    noun: "Import costs", unit: "import cost", defaultSeverity: 10,
    keywords: /\b(tariff|tariffs|import costs?|import dut(?:y|ies))\b/i, explicit: /\b(tariff|tariffs|import costs?|import dut(?:y|ies))\b/i, up: /\b(up|rise|rises|higher|increase|increases|raise|raises|impose|imposes|hike|hikes)\b/i, down: DOWN,
    groups: [{ label: "Imported hardware costs", sector: "Technology", coefficient: -0.25 }, { label: "Imported goods costs", sector: "Consumer Discretionary", coefficient: -0.3 }, { label: "Imported inputs", sector: "Industrials", coefficient: -0.15 }],
    entities: {
      ...sectorNames(["AAPL", "NVDA", "AMD", "AVGO", "TSM"], 0, "Technology"),
      ...sectorNames(["AMZN", "TSLA", "NKE", "HD"], 1, "Consumer Discretionary"),
      ...sectorNames(["DAL", "UAL", "AAL", "UPS", "FDX", "CAT"], 2, "Industrials"),
    },
  },
  usd: {
    noun: "US dollar", unit: "dollar index", defaultSeverity: 10,
    keywords: /\b(dollar|usd|dxy)\b/i, explicit: /\b(dollar|usd|dxy)\b/i, up: /\b(up|rise|rises|higher|increase|increases|strengthen|strengthens|stronger|surge|surges)\b/i, down: DOWN,
    groups: [{ label: "Overseas revenue translated to fewer dollars", sector: "Technology", coefficient: -0.2 }, { label: "Commodity and export pricing", sector: "Materials", coefficient: -0.25 }, { label: "Export competitiveness", sector: "Industrials", coefficient: -0.15 }],
    entities: {},
  },
  "chip-supply": {
    noun: "Chip supply disruption", unit: "advanced-chip supply loss", defaultSeverity: 20,
    keywords: /\b(taiwan|tsmc|chip supply|semiconductor supply|chip shortage|semiconductors?)\b/i, explicit: /\b(chip supply|semiconductor supply|chip shortage)\b/i, up: /\b(drop|drops|fall|falls|decline|declines|close|closes|blockade|blockades|invade|invades|invasion|disrupt|disrupts|disruption|shortage|cut|cuts|halt|halts|loss)\b/i, down: /\b(resolve|resolves|recover|recovers|restore|restores)\b/i,
    groups: [{ label: "Foundry and chip-maker output", coefficient: -0.5 }, { label: "Device makers dependent on chips", sector: "Technology", coefficient: -0.1 }],
    entities: Object.fromEntries(Object.entries({ TSM: -0.6, NVDA: -0.45, AMD: -0.45, AVGO: -0.35, MU: -0.4, ASML: -0.3, AMAT: -0.3 }).map(([t, c]) => [t, { group: 0, sector: "Technology", coefficient: c }])),
  },
};
export const DRIVER_IDS = Object.keys(DRIVERS) as Driver[];

const triggerOf = (question: string) => question.replace(/^\s*what if\s+/i, "").replace(/[?.\s]+$/, "").slice(0, 90);

// Deterministic reading of an explicit driver + direction (+ optional %). Anything ambiguous returns null.
export function knownPlan(question: string): ResearchPlan | null {
  const matches = DRIVER_IDS.filter(d => DRIVERS[d].keywords.test(question));
  if (matches.length !== 1) return null; // Never silently collapse combined or unknown shocks.
  const driver = matches[0];
  const spec = DRIVERS[driver];
  const down = spec.down.test(question);
  const up = spec.up.test(question);
  if (down === up) return null;
  const magnitude = question.match(/(\d+(?:\.\d+)?)\s*%/);
  const severity = magnitude ? Number(magnitude[1]) : spec.defaultSeverity;
  if (!Number.isFinite(severity) || severity < 1 || severity > 60 || /percentage points?|\bbps\b/i.test(question)) return null;
  const event = spec.explicit.test(question) ? null : question.match(spec.keywords)?.[0];
  return {
    driver, direction: down ? -1 : 1, severity, trigger: triggerOf(question), magnitudeStated: Boolean(magnitude),
    ...(event ? { basis: "assumed", rationale: `a fixed rule maps “${event}” to the ${spec.noun.toLowerCase()} driver` } : { basis: "stated" }),
  };
}

// Hypotheticals and explicit driver moves ("Taiwan chip supply drops 30%") go to the scenario graph; everything else to Ask.
export const isScenarioQuestion = (question: string) => /\bwhat if\b|\bscenario\b/i.test(question) || knownPlan(question) !== null;

// Validates a model-proposed interpretation. The model only chooses among fixed drivers; the numbers still come from DRIVERS.
// A magnitude counts only when that number appears in the question or a cited note; otherwise the labeled default is used.
export function planFromProposal(question: string, raw: unknown, evidence: ResearchEvidence[] = []): ResearchPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.driver !== "string" || !(p.driver in DRIVERS)) return null;
  if (p.direction !== 1 && p.direction !== -1) return null;
  const driver = p.driver as Driver;
  const cited = [question, ...evidence.map(e => e.text)].join(" ");
  const stated = typeof p.severity === "number" && Number.isFinite(p.severity) && p.severity >= 1 && p.severity <= 60
    && new RegExp(`(^|[^\\d.])${String(p.severity).replace(".", "\\.")}\\s*(%|percent)`, "i").test(cited);
  const rationale = typeof p.rationale === "string" ? p.rationale.replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "").slice(0, 320) : "";
  if (!rationale) return null;
  return { driver, direction: p.direction, severity: stated ? Math.round(p.severity as number) : DRIVERS[driver].defaultSeverity, basis: "assumed", trigger: triggerOf(question), rationale, magnitudeStated: stated };
}

export function researchScenario(plan: ResearchPlan, evidence: ResearchEvidence[]): {
  base: ShockScenario; table: ScenarioTable; assumption: string; sensitivities: ResearchResult["sensitivities"];
} {
  const spec = DRIVERS[plan.driver];
  const driver = spec.noun;
  const change = plan.direction > 0 ? "increase" : "decrease";
  const sources: Source[] = evidence.flatMap((claim, i) => claim.sources.map((source, j) => claim.filing ? {
    id: `research-${i}-${j}`, title: source.title, issuer: claim.filing.issuer,
    date: claim.filing.filedAt, docType: claim.filing.form, section: "Item 1A. Risk Factors",
    excerpt: claim.filing.quote, url: source.url,
  } : {
    id: `research-${i}-${j}`, title: source.title, issuer: new URL(source.url).hostname,
    date: "", docType: "News" as const, section: "Research summary, not a verbatim quotation",
    excerpt: claim.text, url: source.url,
  }));
  if (!sources.length) throw new Error("No supporting sources");
  const sourceId = sources[0].id;
  const table: ScenarioTable = { channels: [], entities: {}, sectors: {} };
  for (const [i, g] of spec.groups.entries()) {
    const channel = `research-channel-${i}`;
    table.channels.push({ id: channel, label: g.label, sublabel: "Illustrative sector sensitivity", weight: Math.abs(g.coefficient), method: "ASSUMPTION", sourceId });
    if (g.sector) table.sectors[g.sector] = { channel, ret: g.coefficient * plan.direction * plan.severity / 100, sourceId };
  }
  for (const [ticker, row] of Object.entries(spec.entities)) {
    const coefficient = row.coefficient ?? spec.groups[row.group].coefficient;
    table.entities[ticker] = { channel: `research-channel-${row.group}`, ret: coefficient * plan.direction * plan.severity / 100, sourceId, sector: row.sector, kind: "Illustrative sector sensitivity" };
  }
  const origin = plan.basis === "assumed"
    ? `Your question did not state this driver; it is read as "${driver.toLowerCase()} ${change}"${plan.rationale ? ` (${plan.rationale})` : ""}. This link is an assumption, not a prediction that the event or policy will happen.`
    : "";
  const magnitude = plan.magnitudeStated ? "" : ` The ${plan.severity}% size is a default setting, not derived from the sources; move the slider to test other sizes.`;
  const assumption = `Assume a ${plan.severity}% ${change} in ${spec.unit}. ${origin}${magnitude} Sector sensitivities are illustrative settings chosen for this stress test, not measured stock forecasts. No time horizon or event probability is estimated.`.replace(/\s+/g, " ");
  const headline = `Under a {severity}% ${change} in ${driver.toLowerCase()}, the modeled portfolio change is {pct} ({usd}).`;
  return {
    assumption, table, sensitivities: spec.groups.map(({ label, sector, coefficient }) => ({ group: sector ?? label, coefficient })),
    base: {
      id: "researched", label: `${driver} ${change}`, shortLabel: `${driver} ${plan.direction > 0 ? "+" : "−"}${plan.severity}%`,
      description: assumption, baseSeverity: plan.severity, minSeverity: 1, maxSeverity: 60,
      severityLabel: `${spec.unit} ${change} (assumption)`, keywords: [],
      nodes: [{ id: "research-driver", kind: "driver", label: `${driver} ${change}`, sublabel: `Hypothetical: ${plan.trigger}`.slice(0, 70), x: 110, y: 280 }],
      edges: [], impacts: [], notModeled: [], sources,
      headline: { beginner: headline, intermediate: headline, advanced: headline },
    },
  };
}
