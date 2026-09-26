import { HOLDINGS, PORTFOLIO_TOTAL } from "@/data/portfolio";
import { BASKETS, EXPOSURES, exposureTotal } from "@/data/xray";
import type { Connector, MapExposure, MapPosition } from "./types";

// Contributions below this don't get a line (VOO's $8.40 of BXP).
const MIN_CONNECTOR = 100;
const COMPANY_ROWS = ["NVDA", "AAPL", "MSFT"] as const;
const REST_ID = "rest";
const BANKS_ID = "regional-banks";

// Turns canon data into the rows and connectors the map draws. Pure; every number derives from canon.
export function buildDemoMap() {
  const positions: MapPosition[] = HOLDINGS.map((h) => ({
    id: h.ticker,
    ticker: h.ticker,
    category: h.category,
    value: h.value,
    weight: h.value / PORTFOLIO_TOTAL,
    color: h.color,
  }));

  const byTicker = (t: string) => {
    const e = EXPOSURES.find((x) => x.ticker === t);
    if (!e) throw new Error(`Missing exposure ${t}`);
    return e;
  };
  const companies = [...COMPANY_ROWS.map(byTicker), byTicker("BXP")];
  const basket = BASKETS[0];

  const connectors: Connector[] = [];
  for (const e of companies) {
    for (const s of e.sources) {
      if (s.value < MIN_CONNECTOR) continue;
      const from = s.via === "Direct" ? e.ticker : s.via;
      connectors.push({ id: `${from}-${e.ticker}`, from, to: e.ticker, value: s.value, etf: s.via !== "Direct" });
    }
  }
  connectors.push({ id: `${basket.via}-${BANKS_ID}`, from: basket.via, to: BANKS_ID, value: basket.value, etf: true });

  // Whatever each broad ETF holds beyond the named companies.
  const restSources = (["VOO", "QQQ"] as const).map((etf) => {
    const holding = HOLDINGS.find((h) => h.ticker === etf)?.value ?? 0;
    const named = companies.flatMap((e) => e.sources).filter((s) => s.via === etf).reduce((sum, s) => sum + s.value, 0);
    return { via: etf, value: holding - named };
  });
  for (const s of restSources) connectors.push({ id: `${s.via}-${REST_ID}`, from: s.via, to: REST_ID, value: s.value, etf: true });

  const named = [...companies.map(exposureTotal), basket.value].reduce((a, b) => a + b, 0);
  const restValue = PORTFOLIO_TOTAL - named;

  const toRow = (ticker: string): MapExposure => {
    const e = byTicker(ticker);
    const value = exposureTotal(e);
    return { id: e.ticker, name: e.name, ticker: e.ticker, color: e.color, value, weight: value / PORTFOLIO_TOTAL, sources: e.sources };
  };

  const exposures: MapExposure[] = [
    ...COMPANY_ROWS.map(toRow),
    {
      id: BANKS_ID,
      name: basket.label,
      note: `${basket.holdingsCount} via ${basket.via}`,
      value: basket.value,
      weight: basket.value / PORTFOLIO_TOTAL,
      sources: [{ via: basket.via, value: basket.value }],
    },
    toRow("BXP"),
    { id: REST_ID, name: "Everything else", note: "650+ companies", value: restValue, weight: restValue / PORTFOLIO_TOTAL, sources: restSources },
  ];

  // ETF lines draw first, then direct links (the reveal reads as "opening up" the funds).
  const drawOrder = [...connectors.filter((c) => c.etf), ...connectors.filter((c) => !c.etf)].map((c) => c.id);

  return { positions, exposures, connectors, drawOrder };
}
