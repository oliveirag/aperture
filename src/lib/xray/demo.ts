import { AS_OF, HOLDINGS, PORTFOLIO_TOTAL } from "@/data/portfolio";
import {
  ETF_Aperture,
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
import type { Coverage, XrayModel } from "./types";

const valueOf = (t: string) => HOLDINGS.find((h) => h.ticker === t)?.value ?? 0;
const countOf = (t: string) => ETF_Aperture.find((e) => e.ticker === t)?.holdingsCount ?? 0;

// The curated canon lists each fund's top holdings, not every weight, so fund coverage is "curated" (null share).
const DEMO_COVERAGE: Coverage[] = HOLDINGS.map((h) =>
  h.type === "etf"
    ? { ticker: h.ticker, kind: "etf", visibleShare: null, asOf: XRAY_SOURCES.find((s) => s.id === `s-${h.ticker.toLowerCase()}-holdings`)?.date ?? AS_OF, source: "Curated demo snapshot (top holdings only)" }
    : { ticker: h.ticker, kind: "stock", visibleShare: 1, asOf: null, source: "Held directly" },
);

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
  // The canon lists the ten largest companies; the rest of the 654 are summarized, not listed.
  exposures: EXPOSURES,
  etfColumns: ["VOO", "QQQ"],
  sectors: SECTORS,
  overlaps: OVERLAPS.map((o) => ({ ...o, aValue: valueOf(o.a), bValue: valueOf(o.b), bCount: countOf(o.b) })),
  flags: FLAGS,
  sources: XRAY_SOURCES,
  opaque: [],
  coverage: DEMO_COVERAGE,
  valuation: { asOf: AS_OF, source: "Dated demo snapshot" },
};
