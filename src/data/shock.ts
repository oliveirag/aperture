import type { ScenarioId, ShockScenario, Source } from "../types/demo";
import { scaleShock } from "../lib/format";
import { PORTFOLIO_TOTAL } from "./portfolio";
import { XRAY_SOURCES } from "./xray";

// Excerpts are concise paraphrases of themes in the named public documents.
function holdingsSource(id: string): Source {
  const s = XRAY_SOURCES.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown source ${id}`);
  return s;
}

const CRE: ShockScenario = {
  id: "cre",
  label: "Commercial real estate decline",
  shortLabel: "CRE −20%",
  description: "Office and commercial property values fall; REITs and regional bank loan books absorb the hit.",
  baseSeverity: 20,
  minSeverity: 5,
  maxSeverity: 40,
  severityLabel: "decline in CRE values",
  keywords: ["real estate", "cre", "office", "property", "reit", "commercial", "building"],
  nodes: [
    { id: "cre", kind: "driver", label: "Commercial real estate values", sublabel: "−{severity}%", x: 110, y: 280 },
    { id: "office", kind: "channel", label: "Office valuations", sublabel: "Most rate-sensitive property type", x: 390, y: 150 },
    { id: "bankcre", kind: "channel", label: "Regional bank CRE loans", sublabel: "Largest CRE lenders", x: 390, y: 380 },
    { id: "credit", kind: "channel", label: "Credit conditions", sublabel: "Lending standards tighten", x: 630, y: 470 },
    { id: "BXP", kind: "holding", ticker: "BXP", label: "BXP", sublabel: "Office REIT · 8.6%", x: 880, y: 120 },
    { id: "KRE", kind: "holding", ticker: "KRE", label: "KRE", sublabel: "Regional banks ETF · 11.4%", x: 880, y: 300 },
    { id: "VOO", kind: "holding", ticker: "VOO", label: "VOO", sublabel: "S&P 500 ETF · 28.3%", x: 880, y: 470 },
  ],
  edges: [
    { id: "e-cre-office", from: "cre", to: "office", label: "Valuation repricing", weight: 1.1, method: "DER-VALUATION", sourceId: "s-bxp-10k-values" },
    { id: "e-office-bxp", from: "office", to: "BXP", label: "Office NAV and refinancing", weight: 1.02, method: "DER-NAV", sourceId: "s-bxp-10k" },
    { id: "e-cre-bankcre", from: "cre", to: "bankcre", label: "Collateral values fall", weight: 0.85, method: "DER-CREDIT", sourceId: "s-zion-10k" },
    { id: "e-bankcre-kre", from: "bankcre", to: "KRE", label: "ETF look-through", weight: 0.78, method: "DER-Aperture", sourceId: "s-kre-holdings" },
    { id: "e-bankcre-credit", from: "bankcre", to: "credit", label: "Tighter lending", weight: 0.4, method: "DER-CREDIT", sourceId: "s-zion-10k-credit" },
    { id: "e-credit-voo", from: "credit", to: "VOO", label: "Financials 13.1% + Real Estate 2.2% of VOO", weight: 0.065, method: "DER-SECTOR", sourceId: "s-voo-holdings" },
  ],
  impacts: [
    { ticker: "BXP", baseReturn: -0.225, baseDollar: -2862, pathEdgeIds: ["e-cre-office", "e-office-bxp"], pathLabel: "CRE decline → office valuations → BXP" },
    { ticker: "KRE", baseReturn: -0.155, baseDollar: -2619.5, pathEdgeIds: ["e-cre-bankcre", "e-bankcre-kre"], pathLabel: "CRE decline → regional bank CRE loans → KRE" },
    { ticker: "VOO", baseReturn: -0.013, baseDollar: -546, pathEdgeIds: ["e-cre-bankcre", "e-bankcre-credit", "e-credit-voo"], pathLabel: "CRE decline → bank lending → credit conditions → VOO" },
  ],
  notModeled: ["QQQ", "NVDA", "AAPL", "MSFT"],
  sources: [
    {
      id: "s-bxp-10k-values",
      title: "BXP, Inc. Form 10-K (filed 2026-02-27)",
      docType: "10-K",
      issuer: "BXP, Inc.",
      date: "2026-02-27",
      section: "Item 1A. Risk Factors",
      excerpt:
        "sustained changes in client preferences and space utilization from full-time, collective in-person work environments to hybrid or remote work models and/or changes from workforce reductions due to artificial intelligence, which could decrease overall demand for workplaces and negatively impact market rental rates and property values",
      highlight: "negatively impact market rental rates and property values",
      url: "https://www.sec.gov/Archives/edgar/data/1037540/000103754026000006/bxp-20251231.htm",
    },
    {
      id: "s-bxp-10k",
      title: "BXP, Inc. Form 10-K (filed 2026-02-27)",
      docType: "10-K",
      issuer: "BXP, Inc.",
      date: "2026-02-27",
      section: "Item 1A. Risk Factors",
      excerpt:
        "A downturn in the economies of these markets, or the impact that a downturn in the overall national economy may have upon these economies, could result in reduced demand for office space and/or a reduction in rents.",
      highlight: "reduced demand for office space",
      url: "https://www.sec.gov/Archives/edgar/data/1037540/000103754026000006/bxp-20251231.htm",
    },
    {
      id: "s-zion-10k",
      title: "Zions Bancorporation Form 10-K (filed 2026-02-24)",
      docType: "10-K",
      issuer: "Zions Bancorporation, N.A.",
      date: "2026-02-24",
      section: "Item 1A. Risk Factors",
      excerpt:
        "We have a concentration of risk within our loan portfolio, including, but not limited to, loans secured by real estate, oil and gas-related lending, and leveraged and enterprise value lending.",
      highlight: "loans secured by real estate",
      url: "https://www.sec.gov/Archives/edgar/data/109380/000010938026000046/zions-20251231.htm",
    },
    holdingsSource("s-kre-holdings"),
    {
      id: "s-zion-10k-credit",
      title: "Zions Bancorporation Form 10-K (filed 2026-02-24)",
      docType: "10-K",
      issuer: "Zions Bancorporation, N.A.",
      date: "2026-02-24",
      section: "Item 1A. Risk Factors",
      excerpt:
        "Adverse macroeconomic conditions—such as rising or persistently elevated interest rates, heightened market volatility, or a weakening U.S. economy at both the national and local markets in which we operate—could result in, among other things, deterioration in credit quality and reduced credit demand.",
      highlight: "deterioration in credit quality and reduced credit demand",
      url: "https://www.sec.gov/Archives/edgar/data/109380/000010938026000046/zions-20251231.htm",
    },
    holdingsSource("s-voo-holdings"),
  ],
  headline: {
    beginner: "If office and commercial buildings lost {severity}% of their value, your portfolio could fall about {usd} ({pct}).",
    intermediate: "A {severity}% commercial real estate decline would move your portfolio about {pct} ({usd}).",
    advanced:
      "A {severity}% decline in CRE values maps to {pct} ({usd}) across 3 modeled holdings; 4 holdings have no modeled path.",
  },
};

const AI_CAPEX: ShockScenario = {
  id: "ai-capex",
  label: "AI data-center spending pullback",
  shortLabel: "AI capex −30%",
  description: "Hyperscalers cut AI infrastructure budgets; GPU demand and cloud AI growth slow.",
  baseSeverity: 30,
  minSeverity: 10,
  maxSeverity: 50,
  severityLabel: "cut in hyperscaler AI capex",
  keywords: ["ai", "capex", "gpu", "data center", "datacenter", "nvidia", "hyperscaler", "chip", "semiconductor"],
  nodes: [
    { id: "capex", kind: "driver", label: "Hyperscaler AI capex", sublabel: "−{severity}%", x: 110, y: 280 },
    { id: "gpu", kind: "channel", label: "Data-center GPU demand", sublabel: "Accelerator orders", x: 390, y: 170 },
    { id: "cloud", kind: "channel", label: "Cloud AI revenue growth", sublabel: "Capacity outpaces demand", x: 390, y: 410 },
    { id: "NVDA", kind: "holding", ticker: "NVDA", label: "NVDA", sublabel: "Direct · 13.3%", x: 880, y: 90 },
    { id: "QQQ", kind: "holding", ticker: "QQQ", label: "QQQ", sublabel: "Nasdaq-100 ETF · 21.2%", x: 880, y: 230 },
    { id: "VOO", kind: "holding", ticker: "VOO", label: "VOO", sublabel: "S&P 500 ETF · 28.3%", x: 880, y: 370 },
    { id: "MSFT", kind: "holding", ticker: "MSFT", label: "MSFT", sublabel: "Direct · 7.6%", x: 880, y: 500 },
  ],
  edges: [
    { id: "e-capex-gpu", from: "capex", to: "gpu", label: "Fewer GPU orders", weight: 0.95, method: "DER-REVENUE", sourceId: "s-nvda-10k" },
    { id: "e-gpu-nvda", from: "gpu", to: "NVDA", label: "Data-center revenue", weight: 0.8, method: "DER-REVENUE", sourceId: "s-nvda-10k" },
    { id: "e-gpu-qqq", from: "gpu", to: "QQQ", label: "NVDA is 9.9% of QQQ", weight: 0.099, method: "DER-Aperture", sourceId: "s-qqq-holdings" },
    { id: "e-gpu-voo", from: "gpu", to: "VOO", label: "NVDA is 7.6% of VOO", weight: 0.076, method: "DER-Aperture", sourceId: "s-voo-holdings" },
    { id: "e-capex-cloud", from: "capex", to: "cloud", label: "Slower AI capacity build", weight: 0.35, method: "DER-CAPEX", sourceId: "s-msft-10k" },
    { id: "e-cloud-msft", from: "cloud", to: "MSFT", label: "Cloud margin pressure", weight: 0.2, method: "DER-MARGIN", sourceId: "s-msft-10k" },
  ],
  impacts: [
    { ticker: "NVDA", baseReturn: -0.24, baseDollar: -4752, pathEdgeIds: ["e-capex-gpu", "e-gpu-nvda"], pathLabel: "AI capex cut → GPU demand → NVDA" },
    { ticker: "QQQ", baseReturn: -0.055, baseDollar: -1732.5, pathEdgeIds: ["e-capex-gpu", "e-gpu-qqq"], pathLabel: "AI capex cut → GPU demand → QQQ" },
    { ticker: "VOO", baseReturn: -0.024, baseDollar: -1008, pathEdgeIds: ["e-capex-gpu", "e-gpu-voo"], pathLabel: "AI capex cut → GPU demand → VOO" },
    { ticker: "MSFT", baseReturn: -0.06, baseDollar: -678, pathEdgeIds: ["e-capex-cloud", "e-cloud-msft"], pathLabel: "AI capex cut → cloud AI growth → MSFT" },
  ],
  notModeled: ["AAPL", "KRE", "BXP"],
  sources: [
    {
      id: "s-nvda-10k",
      title: "NVIDIA Form 10-K (filed 2026-02-25)",
      docType: "10-K",
      issuer: "NVIDIA Corporation",
      date: "2026-02-25",
      section: "Item 1A. Risk Factors",
      excerpt:
        "We generate a significant amount of our revenue from a limited number of indirect customers, and we estimate some individually representing 10% or more of our revenue.",
      highlight: "a limited number of indirect customers",
      url: "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000021/nvda-20260125.htm",
    },
    {
      id: "s-msft-10k",
      title: "Microsoft Form 10-K (filed 2026-07-29)",
      docType: "10-K",
      issuer: "Microsoft Corporation",
      date: "2026-07-29",
      section: "Item 1A. Risk Factors",
      excerpt:
        "If adoption of our AI services develops more slowly than expected, or if customers do not continue to utilize Azure for AI workloads at anticipated levels, we may not realize the expected returns on our investments.",
      highlight: "we may not realize the expected returns on our investments",
      url: "https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.htm",
    },
    holdingsSource("s-qqq-holdings"),
    holdingsSource("s-voo-holdings"),
  ],
  headline: {
    beginner:
      "If the biggest tech companies spent {severity}% less on AI computers, your portfolio could fall about {usd} ({pct}).",
    intermediate: "If big tech cuts AI data-center spending {severity}%, your portfolio could move about {pct} ({usd}).",
    advanced:
      "A {severity}% cut in hyperscaler AI capex maps to {pct} ({usd}) across 4 modeled holdings; 3 holdings have no modeled path.",
  },
};

// Both demo scenarios, CRE first (the Blackstone story).
export const SCENARIOS: ShockScenario[] = [CRE, AI_CAPEX];

export function getScenario(id: ScenarioId): ShockScenario {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown scenario ${id}`);
  return s;
}

// Portfolio impact at a given severity (linear in severity).
export function scenarioTotals(s: ShockScenario, severity: number, total = PORTFOLIO_TOTAL) {
  const dollar = s.impacts.reduce((sum, i) => sum + scaleShock(i.baseDollar, severity, s.baseSeverity), 0);
  return { dollar, pct: total > 0 ? dollar / total : 0 };
}
