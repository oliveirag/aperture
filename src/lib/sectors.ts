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
  TECHNOLOGY: "Technology",
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
  [/utilit/i, "Utilities"],
  [/restaurant/i, "Consumer Discretionary"],
  [/beverage|food|tobacco|household|personal products|consumer staples|drug retail/i, "Consumer Staples"],
  [/retail|auto|hotel|restaurant|leisure|textile|apparel|luxury|consumer|distributor|homebuilding/i, "Consumer Discretionary"],
  [/oil|gas|energy|coal/i, "Energy"],
  [/utilit/i, "Utilities"],
  [/chemical|metal|mining|paper|forest|packaging|materials|steel/i, "Materials"],
  [/aerospace|defense|airline|machinery|industrial|transport|logistics|road|rail|marine|construction|building|electrical|commercial services|professional services|trading companies/i, "Industrials"],
];

// Conservative crosswalk, NOT an official GICS assignment. Only unambiguous
// SEC SIC descriptions are mapped; unsupported codes stay Other. Caller must
// retain the filing/profile source of the code alongside this mapping method.
// SIC descriptions: https://www.sec.gov/search-filings/standard-industrial-classification-sic-code-list
const SIC_SECTORS: Readonly<Record<number, SectorLabel>> = {
  1311: "Energy", 2911: "Energy", 2834: "Health Care", 2836: "Health Care",
  3571: "Technology", 3674: "Technology", 7372: "Technology",
  4911: "Utilities", 4923: "Utilities", 4924: "Utilities", 4931: "Utilities",
  6021: "Financials", 6022: "Financials", 6035: "Financials", 6036: "Financials",
  6311: "Financials", 6321: "Financials", 6331: "Financials", 6798: "Real Estate",
  5812: "Consumer Discretionary", 5411: "Consumer Staples",
};
export function sectorFromSic(sic: number | null | undefined): SectorLabel {
  return sic !== null && sic !== undefined && Number.isInteger(sic) ? SIC_SECTORS[sic] ?? "Other" : "Other";
}

export function sectorFromIndustry(industry: string | null | undefined): SectorLabel {
  if (!industry) return "Other";
  for (const [re, label] of INDUSTRY_RULES) if (re.test(industry)) return label;
  return "Other";
}
