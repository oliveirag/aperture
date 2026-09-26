// Starter templates for the beginner Practice Portfolio (PRD 3.0). Hypothetical dollars are split evenly across
// the tickers and priced live; nothing is bought.

export type PracticeTemplate = {
  id: string;
  title: string;
  body: string;
  // Name is only a fallback for funds Finnhub has no profile for.
  tickers: { ticker: string; name: string }[];
};

export const PRACTICE_TEMPLATES: PracticeTemplate[] = [
  {
    id: "market",
    title: "Just the market",
    body: "One fund that owns the 500 largest US companies. The simplest way to own a slice of everything.",
    tickers: [{ ticker: "VOO", name: "Vanguard S&P 500 ETF" }],
  },
  {
    id: "tech",
    title: "Tech curious",
    body: "The Nasdaq-100 fund plus two of the companies inside it. See how the same names can show up twice.",
    tickers: [
      { ticker: "QQQ", name: "Invesco QQQ Trust" },
      { ticker: "AAPL", name: "Apple Inc" },
      { ticker: "NVDA", name: "NVIDIA Corp" },
    ],
  },
  {
    id: "dividend",
    title: "Dividend starter",
    body: "A dividend fund and two companies known for paying steady dividends for decades.",
    tickers: [
      { ticker: "SCHD", name: "Schwab US Dividend Equity ETF" },
      { ticker: "JNJ", name: "Johnson & Johnson" },
      { ticker: "KO", name: "Coca-Cola Co" },
    ],
  },
];

export const PRACTICE_AMOUNTS = [500, 1000, 5000, 10000];
export const DEFAULT_PRACTICE_AMOUNT = 1000;
export const MAX_PRACTICE_TICKERS = 10;
