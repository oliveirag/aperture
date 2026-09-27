import type { Holding } from "../types/demo";

// Canonical demo portfolio. Weights are computed from values, never stored.

// Total market value, the sum of HOLDINGS values.
export const PORTFOLIO_TOTAL = 148420;

// Today's change shown in the top bar.
export const DAY_CHANGE = { value: 612.4, pct: 0.0041 };

// Pricing date for the demo snapshot.
export const AS_OF = "2026-09-25";

// Share of the portfolio for a dollar value.
export function weightOf(value: number) {
  return value / PORTFOLIO_TOTAL;
}

// Holdings in display order (largest first).
export const HOLDINGS: Holding[] = [
  { ticker: "VOO", name: "Vanguard S&P 500 ETF", type: "etf", shares: 75, price: 560, value: 42000, category: "S&P 500 ETF", color: "#8FA3BF" },
  { ticker: "QQQ", name: "Invesco QQQ Trust", type: "etf", shares: 60, price: 525, value: 31500, category: "Nasdaq-100 ETF", color: "#7FB8A4" },
  { ticker: "NVDA", name: "NVIDIA Corporation", type: "stock", shares: 110, price: 180, value: 19800, category: "Semiconductors", color: "#76B900" },
  { ticker: "KRE", name: "SPDR S&P Regional Banking ETF", type: "etf", shares: 260, price: 65, value: 16900, category: "Regional banks ETF", color: "#D98C6A" },
  { ticker: "AAPL", name: "Apple Inc.", type: "stock", shares: 50, price: 284, value: 14200, category: "Consumer technology", color: "#B4B4BC" },
  { ticker: "BXP", name: "BXP, Inc.", type: "stock", shares: 160, price: 79.5, value: 12720, category: "Office REIT", color: "#C9A66B" },
  { ticker: "MSFT", name: "Microsoft Corporation", type: "stock", shares: 20, price: 565, value: 11300, category: "Software", color: "#5B9BD5" },
];
