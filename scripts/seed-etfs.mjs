// Seeds src/data/etf-seed.json with Alpha Vantage ETF_PROFILE data for popular US ETFs.
// Run: node scripts/seed-etfs.mjs [TICKER ...]
// Reads ALPHA_VANTAGE_API_KEY from the environment or .env. The free key allows 25 calls a day, so ETFs
// already in the seed are skipped; run it again tomorrow to finish, or pass --refresh to refetch everything.
import { readFile, writeFile } from "node:fs/promises";

const OUT = "src/data/etf-seed.json";
const PAUSE_MS = 1500;
const DEFAULT_ETFS = [
  "VOO", "QQQ", "KRE", "SPY", "IVV", "VTI", "SCHD", "VUG", "VTV", "VGT",
  "XLK", "XLF", "SMH", "IWM", "DIA", "VXUS", "VEA", "VNQ", "ARKK", "SCHG",
];

async function apiKey() {
  if (process.env.ALPHA_VANTAGE_API_KEY) return process.env.ALPHA_VANTAGE_API_KEY;
  const env = await readFile(".env", "utf8").catch(() => "");
  return env.match(/^ALPHA_VANTAGE_API_KEY=(.+)$/m)?.[1]?.trim();
}

const args = process.argv.slice(2);
const refresh = args.includes("--refresh");
const tickers = args.filter((a) => !a.startsWith("--")).map((t) => t.toUpperCase());
const key = await apiKey();
if (!key) {
  console.error("Set ALPHA_VANTAGE_API_KEY (free at https://www.alphavantage.co/support/#api-key).");
  process.exit(1);
}

const seed = JSON.parse(await readFile(OUT, "utf8").catch(() => "{}"));
const todo = (tickers.length ? tickers : DEFAULT_ETFS).filter((t) => refresh || !seed[t]);

for (const [i, t] of todo.entries()) {
  if (i > 0) await new Promise((r) => setTimeout(r, PAUSE_MS));
  const res = await fetch(`https://www.alphavantage.co/query?function=ETF_PROFILE&symbol=${t}&apikey=${key}`);
  const raw = await res.json();
  if (raw.Information || raw.Note) {
    console.error(`Stopped at ${t}: ${raw.Information ?? raw.Note}`);
    break;
  }
  if (!Array.isArray(raw.holdings) || raw.holdings.length === 0) {
    console.warn(`${t}: no holdings, skipped`);
    continue;
  }
  // Keep only what the look-through reads.
  seed[t] = {
    last_updated: raw.last_updated,
    sectors: raw.sectors ?? [],
    holdings: raw.holdings.map(({ symbol, description, weight }) => ({ symbol, description, weight })),
  };
  console.log(`${t}: ${raw.holdings.length} holdings`);
  await writeFile(OUT, `${JSON.stringify(seed, null, 1)}\n`);
}

console.log(`Seed has ${Object.keys(seed).length} ETFs: ${Object.keys(seed).sort().join(", ")}`);
