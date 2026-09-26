import { HOLDINGS, PORTFOLIO_TOTAL } from "@/data/portfolio";
import {
  ETF_LOOKTHROUGH,
  EXPOSURES,
  FLAGS,
  OVERLAPS,
  POSITIONS_COUNT,
  SECTORS,
  UNDERLYING_COMPANIES,
  XRAY_HEADLINE,
  XRAY_SOURCES,
  XRAY_SUBLINE,
} from "@/data/xray";
import { buildDemoMap } from "./demo-map";
import type { XrayModel } from "./types";

const valueOf = (t: string) => HOLDINGS.find((h) => h.ticker === t)?.value ?? 0;
const countOf = (t: string) => ETF_LOOKTHROUGH.find((e) => e.ticker === t)?.holdingsCount ?? 0;

// The curated demo portfolio in the shared model shape. Every number is canon (checked by scripts/check-canon.ts).
export const DEMO_XRAY: XrayModel = {
  mode: "demo",
  total: PORTFOLIO_TOTAL,
  positionsCount: POSITIONS_COUNT,
  underlyingCompanies: UNDERLYING_COMPANIES,
  headline: XRAY_HEADLINE,
  subline: XRAY_SUBLINE,
  map: { ...buildDemoMap(), pinId: "NVDA", maxPosition: Math.max(...HOLDINGS.map((h) => h.value)) },
  topTen: EXPOSURES,
  etfColumns: ["VOO", "QQQ"],
  sectors: SECTORS,
  overlaps: OVERLAPS.map((o) => ({ ...o, aValue: valueOf(o.a), bValue: valueOf(o.b), bCount: countOf(o.b) })),
  flags: FLAGS,
  sources: XRAY_SOURCES,
  opaque: [],
};
