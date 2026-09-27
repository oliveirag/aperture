// One sector vocabulary for the X-Ray: Alpha Vantage ETF sectors (GICS, upper case) and Finnhub company
// industries both map into these labels.
export const SECTOR_LABELS = [
  "Technology",
  "Financials",
  "Health Care",
  "Consumer Discretionary",
  "Communication Services",
  "Industrials",
  "Consumer Staples",
  "Energy",
  "Utilities",
  "Real Estate",
  "Materials",
  "Other",
] as const;
export type SectorLabel = (typeof SECTOR_LABELS)[number];

const GICS: Record<string, SectorLabel> = {
  "INFORMATION TECHNOLOGY": "Technology",
  "COMMUNICATION SERVICES": "Communication Services",
  "CONSUMER DISCRETIONARY": "Consumer Discretionary",
  "CONSUMER STAPLES": "Consumer Staples",
  HEALTHCARE: "Health Care",
  "HEALTH CARE": "Health Care",
  INDUSTRIALS: "Industrials",
  UTILITIES: "Utilities",
  MATERIALS: "Materials",
  ENERGY: "Energy",
  FINANCIALS: "Financials",
  "REAL ESTATE": "Real Estate",
};

// Alpha Vantage ETF sector name -> label.
export function sectorFromGics(name: string): SectorLabel {
  return GICS[name.trim().toUpperCase()] ?? "Other";
}

// Finnhub `finnhubIndustry` -> label. Matched by keyword because Finnhub's list is long and loosely worded.
const INDUSTRY_RULES: [RegExp, SectorLabel][] = [
  [/real estate|reit/i, "Real Estate"],
  [/bank|financial|insurance|capital markets|asset management|credit|mortgage/i, "Financials"],
  [/semiconductor|technology|software|it services|electronic|computer|communications equipment/i, "Technology"],
  [/pharma|biotech|health|medical|life sciences/i, "Health Care"],
  [/media|telecom|communication|entertainment|interactive/i, "Communication Services"],
  [/beverage|food|tobacco|household|personal products|consumer staples|drug retail/i, "Consumer Staples"],
  [/retail|auto|hotel|restaurant|leisure|textile|apparel|luxury|consumer|distributor|homebuilding/i, "Consumer Discretionary"],
  [/oil|gas|energy|coal/i, "Energy"],
  [/utilit/i, "Utilities"],
  [/chemical|metal|mining|paper|forest|packaging|materials|steel/i, "Materials"],
  [/aerospace|defense|airline|machinery|industrial|transport|logistics|road|rail|marine|construction|building|electrical|commercial services|professional services|trading companies/i, "Industrials"],
];

export function sectorFromIndustry(industry: string | null | undefined): SectorLabel {
  if (!industry) return "Other";
  for (const [re, label] of INDUSTRY_RULES) if (re.test(industry)) return label;
  return "Other";
}
