// Server-only ticker search: Finnhub /search when it's configured, SEC's ticker list plus the seeded ETFs otherwise.
import { memo } from "@/lib/cache";
import { finnhubConfigured } from "@/lib/finnhub";
import { allCompanies, displayName } from "@/lib/sec";

export type SearchResult = { ticker: string; name: string; type: "stock" | "etf" };

const DAY = 24 * 60 * 60 * 1000;
const LIMIT = 8;
const TICKER = /^[A-Z][A-Z.]{0,5}$/;

// Funds with published holdings in the seed; SEC's list doesn't name most ETFs.
const ETFS: Record<string, string> = {
  VOO: "Vanguard S&P 500 ETF",
  QQQ: "Invesco QQQ Trust",
  KRE: "SPDR S&P Regional Banking ETF",
  SPY: "SPDR S&P 500 ETF Trust",
  IVV: "iShares Core S&P 500 ETF",
  VTI: "Vanguard Total Stock Market ETF",
  SCHD: "Schwab US Dividend Equity ETF",
  VUG: "Vanguard Growth ETF",
  VTV: "Vanguard Value ETF",
  VGT: "Vanguard Information Technology ETF",
  XLK: "Technology Select Sector SPDR Fund",
  XLF: "Financial Select Sector SPDR Fund",
  SMH: "VanEck Semiconductor ETF",
  IWM: "iShares Russell 2000 ETF",
  DIA: "SPDR Dow Jones Industrial Average ETF Trust",
  VXUS: "Vanguard Total International Stock ETF",
  VEA: "Vanguard FTSE Developed Markets ETF",
  VNQ: "Vanguard Real Estate ETF",
  ARKK: "ARK Innovation ETF",
  SCHG: "Schwab US Large-Cap Growth ETF",
};

// Exact ticker, then ticker prefix, then name prefix, then a word in the name starting with the query.
// Ties keep the source order: Finnhub's relevance, or SEC's list, which runs largest companies first. Finnhub's fuzzy
// matches ("google" finds Alphabet) stay, after the direct ones.
export function rank(results: SearchResult[], query: string): SearchResult[] {
  const q = query.trim().toUpperCase();
  const score = (r: SearchResult) => {
    const name = r.name.toUpperCase();
    if (r.ticker === q) return 0;
    if (r.ticker.startsWith(q)) return 1;
    if (name.startsWith(q)) return 2;
    if (name.split(/[\s.,&-]+/).some((w) => w.startsWith(q))) return 3;
    return 4;
  };
  const seen = new Set<string>();
  return results
    .filter((r) => TICKER.test(r.ticker) && !seen.has(r.ticker) && seen.add(r.ticker))
    .map((r, i) => ({ r, s: score(r), i }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .slice(0, LIMIT)
    .map((x) => x.r);
}

type FinnhubResult = { description: string; displaySymbol: string; symbol: string; type: string };
const TYPES: Record<string, SearchResult["type"]> = { "Common Stock": "stock", ADR: "stock", REIT: "stock", ETP: "etf" };

async function viaFinnhub(q: string): Promise<SearchResult[]> {
  const url = new URL("https://finnhub.io/api/v1/search");
  url.searchParams.set("q", q);
  url.searchParams.set("exchange", "US");
  const res = await fetch(url, { headers: { "X-Finnhub-Token": process.env.FINNHUB_API_KEY ?? "" }, signal: AbortSignal.timeout(4000), cache: "no-store" });
  if (!res.ok) throw new Error(`finnhub /search ${res.status}`);
  const data = (await res.json()) as { result?: FinnhubResult[] };
  return (data.result ?? [])
    .filter((r) => TYPES[r.type])
    .map((r) => ({ ticker: r.symbol.toUpperCase(), name: ETFS[r.symbol] ?? displayName(r.description), type: TYPES[r.type] }));
}

// SEC names carry state-of-incorporation tags ("Applied Materials Inc /de").
const tidy = (name: string) => displayName(name).replace(/\s*\/[a-z]{2,3}\/?$/i, "").trim();

async function viaLocal(q: string): Promise<SearchResult[]> {
  const Q = q.toUpperCase();
  const etfs = Object.entries(ETFS).map(([ticker, name]) => ({ ticker, name, type: "etf" as const }));
  const companies = (await allCompanies().catch(() => [])).map((c) => ({ ticker: c.ticker, name: tidy(c.name), type: "stock" as const }));
  return [...etfs, ...companies].filter((r) => r.ticker.startsWith(Q) || r.name.toUpperCase().split(/[\s.,&-]+/).some((w) => w.startsWith(Q)));
}

export function searchTickers(query: string): Promise<SearchResult[]> {
  const q = query.trim().slice(0, 40);
  return memo(`search:${q.toUpperCase()}`, DAY, async () => {
    let results: SearchResult[] = [];
    if (finnhubConfigured()) results = await viaFinnhub(q).catch(() => []);
    if (results.length === 0) results = await viaLocal(q);
    return rank(results, q);
  });
}
