// Fixed sensitivities for the Shock Test scenarios: the return a company (or a sector's remaining companies) takes when
// the scenario hits at its base severity. Illustrative and deterministic; every one cites the evidence behind its channel.
import seed from "@/data/etf-seed.json";
import type { ScenarioId } from "@/types/demo";

export type Channel = { id: string; label: string; sublabel: string; weight: number; method: string; sourceId: string };
export type EntityRule = { channel: string; ret: number; sourceId: string; kind: string; sector: string };
export type SectorRule = { channel: string; ret: number; sourceId: string };

export type ScenarioTable = {
  channels: Channel[];
  entities: Record<string, EntityRule>;
  // Applied to the part of a sector not already covered by a named company.
  sectors: Record<string, SectorRule>;
};

const OFFICE_REITS = ["BXP", "VNO", "SLG", "HIW", "KRC", "CUZ", "DEI", "PDM", "BDN", "OPI", "PGRE", "ESRT", "JBGS", "ARE", "EQC", "HPP", "CIO", "FSP"];
// Every bank in the seeded regional-bank ETF, plus the regional-bank ETFs themselves when they're held without look-through.
const KRE = ((seed as unknown as Record<string, { holdings: { symbol: string }[] }>).KRE?.holdings ?? []).map((h) => h.symbol.toUpperCase());
const REGIONAL_BANKS = [...new Set([...KRE, "ZION", "KEY", "CFG", "RF", "HBAN", "FITB", "MTB", "TFC", "CMA", "WAL", "FHN", "EWBC", "WBS", "SNV", "NYCB", "FLG"])];
const BANK_ETFS = ["KRE", "KBE", "IAT", "QABA"];

const GPU = { NVDA: -0.24, AMD: -0.2, AVGO: -0.15, MRVL: -0.18, SMCI: -0.3, ANET: -0.15, MU: -0.12, TSM: -0.12, VRT: -0.15, ASML: -0.08, AMAT: -0.08, LRCX: -0.08, KLAC: -0.08 };
const CLOUD = { MSFT: -0.06, GOOGL: -0.05, GOOG: -0.05, AMZN: -0.05, META: -0.05, ORCL: -0.08 };
const CLOUD_SECTOR: Record<string, string> = { GOOGL: "Communication Services", GOOG: "Communication Services", META: "Communication Services", AMZN: "Consumer Discretionary" };

function rules(tickers: string[], rule: Omit<EntityRule, "sourceId">, sourceFor: (t: string) => string) {
  return Object.fromEntries(tickers.map((t) => [t, { ...rule, sourceId: sourceFor(t) }]));
}

export const TABLES: Record<Exclude<ScenarioId, "researched">, ScenarioTable> = {
  cre: {
    channels: [
      { id: "office", label: "Office valuations", sublabel: "Most rate-sensitive property type", weight: 1.1, method: "DER-VALUATION", sourceId: "s-bxp-10k-values" },
      { id: "bankcre", label: "Regional bank CRE loans", sublabel: "Largest CRE lenders", weight: 0.85, method: "DER-CREDIT", sourceId: "s-zion-10k" },
      { id: "credit", label: "Credit conditions", sublabel: "Lending standards tighten", weight: 0.4, method: "DER-CREDIT", sourceId: "s-zion-10k-credit" },
    ],
    entities: {
      ...rules(OFFICE_REITS, { channel: "office", ret: -0.225, kind: "Office REIT", sector: "Real Estate" }, (t) => (t === "BXP" ? "s-bxp-10k" : "s-bxp-10k-values")),
      ...rules(REGIONAL_BANKS, { channel: "bankcre", ret: -0.155, kind: "Regional bank", sector: "Financials" }, () => "s-zion-10k"),
      ...rules(BANK_ETFS, { channel: "bankcre", ret: -0.155, kind: "Regional banks ETF", sector: "Financials" }, () => "s-kre-holdings"),
    },
    sectors: {
      Financials: { channel: "credit", ret: -0.085, sourceId: "s-zion-10k-credit" },
      "Real Estate": { channel: "credit", ret: -0.085, sourceId: "s-zion-10k-credit" },
    },
  },
  "ai-capex": {
    channels: [
      { id: "gpu", label: "Data-center GPU demand", sublabel: "Accelerator orders", weight: 0.95, method: "DER-REVENUE", sourceId: "s-nvda-10k" },
      { id: "cloud", label: "Cloud AI revenue growth", sublabel: "Capacity outpaces demand", weight: 0.35, method: "DER-CAPEX", sourceId: "s-msft-10k" },
    ],
    entities: {
      ...Object.fromEntries(Object.entries(GPU).map(([t, ret]) => [t, { channel: "gpu", ret, kind: "AI chips and networking", sector: "Technology", sourceId: "s-nvda-10k" }])),
      ...Object.fromEntries(Object.entries(CLOUD).map(([t, ret]) => [t, { channel: "cloud", ret, kind: "Hyperscaler", sector: CLOUD_SECTOR[t] ?? "Technology", sourceId: "s-msft-10k" }])),
    },
    sectors: {},
  },
};
