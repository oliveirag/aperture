import type { EtfAperture, Exposure, Flag, LeveledText, Overlap, SectorSlice, Source } from "../types/demo";
import { weightOf } from "./portfolio";

// Top constituents of each ETF the portfolio holds (weights as fractions of the fund).
export const ETF_Aperture: EtfAperture[] = [
  {
    ticker: "VOO",
    holdingsCount: 503,
    sourceId: "s-voo-holdings",
    top: [
      { ticker: "NVDA", name: "NVIDIA", weight: 0.076 },
      { ticker: "MSFT", name: "Microsoft", weight: 0.067 },
      { ticker: "AAPL", name: "Apple", weight: 0.061 },
      { ticker: "AMZN", name: "Amazon", weight: 0.039 },
      { ticker: "META", name: "Meta Platforms", weight: 0.029 },
      { ticker: "AVGO", name: "Broadcom", weight: 0.026 },
      { ticker: "GOOGL", name: "Alphabet", weight: 0.022 },
      { ticker: "TSLA", name: "Tesla", weight: 0.019 },
      { ticker: "BRK.B", name: "Berkshire Hathaway", weight: 0.017 },
    ],
  },
  {
    ticker: "QQQ",
    holdingsCount: 101,
    sourceId: "s-qqq-holdings",
    top: [
      { ticker: "NVDA", name: "NVIDIA", weight: 0.099 },
      { ticker: "MSFT", name: "Microsoft", weight: 0.087 },
      { ticker: "AAPL", name: "Apple", weight: 0.078 },
      { ticker: "AMZN", name: "Amazon", weight: 0.055 },
      { ticker: "AVGO", name: "Broadcom", weight: 0.05 },
      { ticker: "META", name: "Meta Platforms", weight: 0.036 },
      { ticker: "TSLA", name: "Tesla", weight: 0.029 },
      { ticker: "GOOGL", name: "Alphabet", weight: 0.028 },
    ],
  },
  {
    ticker: "KRE",
    holdingsCount: 140,
    sourceId: "s-kre-holdings",
    top: [
      { ticker: "ZION", name: "Zions Bancorporation", weight: 0.019 },
      { ticker: "WAL", name: "Western Alliance", weight: 0.019 },
      { ticker: "CFG", name: "Citizens Financial", weight: 0.018 },
      { ticker: "EWBC", name: "East West Bancorp", weight: 0.018 },
      { ticker: "FHN", name: "First Horizon", weight: 0.018 },
    ],
  },
];

// The True Top 10. ETF slice = ETF holding value × constituent weight (42000 × 0.076 = 3192).
export const EXPOSURES: Exposure[] = [
  { ticker: "NVDA", name: "NVIDIA", color: "#76B900", value: 26110.5, sources: [{ via: "Direct", value: 19800 }, { via: "VOO", value: 3192 }, { via: "QQQ", value: 3118.5 }] },
  { ticker: "AAPL", name: "Apple", color: "#B4B4BC", value: 19219, sources: [{ via: "Direct", value: 14200 }, { via: "VOO", value: 2562 }, { via: "QQQ", value: 2457 }] },
  { ticker: "MSFT", name: "Microsoft", color: "#5B9BD5", value: 16854.5, sources: [{ via: "Direct", value: 11300 }, { via: "VOO", value: 2814 }, { via: "QQQ", value: 2740.5 }] },
  { ticker: "BXP", name: "BXP", color: "#C9A66B", value: 12728.4, sources: [{ via: "Direct", value: 12720 }, { via: "VOO", value: 8.4 }] },
  { ticker: "AMZN", name: "Amazon", color: "#E2A15B", value: 3370.5, sources: [{ via: "VOO", value: 1638 }, { via: "QQQ", value: 1732.5 }] },
  { ticker: "AVGO", name: "Broadcom", color: "#CC7A52", value: 2667, sources: [{ via: "VOO", value: 1092 }, { via: "QQQ", value: 1575 }] },
  { ticker: "META", name: "Meta Platforms", color: "#6C8EBF", value: 2352, sources: [{ via: "VOO", value: 1218 }, { via: "QQQ", value: 1134 }] },
  { ticker: "GOOGL", name: "Alphabet", color: "#8AA86B", value: 1806, sources: [{ via: "VOO", value: 924 }, { via: "QQQ", value: 882 }] },
  { ticker: "TSLA", name: "Tesla", color: "#9AA0A6", value: 1711.5, sources: [{ via: "VOO", value: 798 }, { via: "QQQ", value: 913.5 }] },
  { ticker: "BRK.B", name: "Berkshire Hathaway", color: "#9C8C6E", value: 714, sources: [{ via: "VOO", value: 714 }] },
];

// Sum of an exposure's sources.
export function exposureTotal(e: Exposure) {
  return e.sources.reduce((sum, s) => sum + s.value, 0);
}

// ETF holdings shown as one basket instead of individual companies.
export const BASKETS = [
  { label: "Regional banks", via: "KRE" as const, value: 16900, holdingsCount: 140, note: "About 140 banks, none above 2% of KRE" },
];

// 503 (VOO) + 17 QQQ-only + 134 KRE-only.
export const UNDERLYING_COMPANIES = 654;

// Positions the user actually bought.
export const POSITIONS_COUNT = 7;

// Concentration thresholds for flags.
export const COMPANY_THRESHOLD = 0.1;
export const SECTOR_THRESHOLD = 0.35;

// Look-through sector weights (sum to 1.000).
export const SECTORS: SectorSlice[] = [
  { sector: "Technology", weight: 0.498 },
  { sector: "Financials", weight: 0.153 },
  { sector: "Real Estate", weight: 0.092 },
  { sector: "Consumer Discretionary", weight: 0.084 },
  { sector: "Communication Services", weight: 0.061 },
  { sector: "Health Care", weight: 0.046 },
  { sector: "Industrials", weight: 0.039 },
  { sector: "Other", weight: 0.027 },
];

// Weighted overlap between ETF pairs.
export const OVERLAPS: Overlap[] = [
  { a: "VOO", b: "QQQ", overlap: 0.43, sharedCompanies: 84 },
  { a: "VOO", b: "KRE", overlap: 0.01, sharedCompanies: 6 },
  { a: "QQQ", b: "KRE", overlap: 0, sharedCompanies: 0 },
];

// Threshold breaches, derived from EXPOSURES and SECTORS so the numbers can't drift.
export const FLAGS: Flag[] = [
  ...EXPOSURES.filter((e) => weightOf(exposureTotal(e)) > COMPANY_THRESHOLD).map((e) => ({
    id: `f-${e.ticker.toLowerCase()}`,
    kind: "company" as const,
    label: e.name,
    weight: weightOf(exposureTotal(e)),
    threshold: COMPANY_THRESHOLD,
  })),
  ...SECTORS.filter((s) => s.weight > SECTOR_THRESHOLD).map((s) => ({
    id: `f-${s.sector.slice(0, 4).toLowerCase()}`,
    kind: "sector" as const,
    label: s.sector,
    weight: s.weight,
    threshold: SECTOR_THRESHOLD,
  })),
];

// Tickers tied to AI data-center spending (used by the IC Room portfolio fit).
export const AI_LINKED_TICKERS = ["NVDA", "MSFT", "AVGO", "AMD"];

// AMD is not held directly: 0.5% of VOO and 1.3% of QQQ.
export const AMD_Aperture = {
  value: 619.5,
  sources: [
    { via: "VOO" as const, value: 210 },
    { via: "QQQ" as const, value: 409.5 },
  ],
};

// Look-through semiconductor exposure.
export const SEMIS_WEIGHT = 0.213;

// X-Ray page headline by experience level.
export const XRAY_HEADLINE: LeveledText = {
  beginner: "About $1 of every $6 you've invested is tied to NVIDIA, even though it looks like one holding.",
  intermediate: "NVIDIA isn't one position. It's three, and 17.6% of your money.",
  advanced: "NVDA is 17.6% of look-through exposure: 13.3% direct, 2.2% via VOO, 2.1% via QQQ.",
};

// X-Ray page subline by experience level.
export const XRAY_SUBLINE: LeveledText = {
  beginner:
    "ETFs are baskets of companies. Yours hold NVIDIA, Apple and Microsoft, which you also own directly, so the same companies show up again and again.",
  intermediate:
    "Your ETFs quietly hold the companies you already own directly. Three companies are each more than 10% of your money.",
  advanced:
    "3 single names exceed the 10% threshold. Technology is 49.8% of look-through value vs a 35% limit. VOO and QQQ overlap 43% by weight.",
};

// ETF holdings sources behind the look-through.
export const XRAY_SOURCES: Source[] = [
  {
    id: "s-voo-holdings",
    title: "Vanguard S&P 500 ETF (VOO) holdings",
    docType: "ETF holdings",
    issuer: "Vanguard",
    date: "2026-08-31",
    excerpt:
      "Top holdings: NVIDIA 7.6%, Microsoft 6.7%, Apple 6.1%, Amazon 3.9%, Meta Platforms 2.9%. 503 holdings. Sector weights include Information Technology 33.9%, Financials 13.1% and Real Estate 2.2%.",
    highlight: "NVIDIA 7.6%",
    url: "https://investor.vanguard.com/investment-products/etfs/profile/voo",
  },
  {
    id: "s-qqq-holdings",
    title: "Invesco QQQ Trust (QQQ) holdings",
    docType: "ETF holdings",
    issuer: "Invesco",
    date: "2026-09-24",
    excerpt: "Top holdings: NVIDIA 9.9%, Microsoft 8.7%, Apple 7.8%, Amazon 5.5%, Broadcom 5.0%. 101 holdings.",
    highlight: "NVIDIA 9.9%",
    url: "https://www.invesco.com/qqq-etf/en/about.html",
  },
  {
    id: "s-kre-holdings",
    title: "SPDR S&P Regional Banking ETF (KRE) holdings",
    docType: "ETF holdings",
    issuer: "State Street Global Advisors",
    date: "2026-09-24",
    excerpt:
      "KRE holds about 140 U.S. regional banks in a modified equal-weight index; no single holding is above roughly 2% of the fund.",
    highlight: "about 140 U.S. regional banks",
    url: "https://www.ssga.com/us/en/intermediary/etfs/spdr-sp-regional-banking-etf-kre",
  },
];
