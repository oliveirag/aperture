// Safe provider warming, not a tour of API routes (which used to secretly spend Alpha/Gemini quota).
// Run with Node's absolute --env-file, remote storage/Gemini variables blank, APERTURE_LOCAL_VERIFICATION=1,
// APERTURE_CACHE_DIR=~/.cache/aperture-shared. No network without --live. --providers=a,b limits the table.
import { withLiveLock } from "./lib/fixtures";
import { warmProviders, type WarmJob } from "./lib/warm-providers";
import { flushCacheWrites, inspectCache } from "../src/lib/cache";
import { localVerification } from "../src/lib/storage-mode";

function fresh(key: string) {
  const evidence = inspectCache(key);
  if (!evidence || evidence.cache.state !== "fresh") throw new Error("Warm only accepts fresh results");
  return evidence.cache.cachedAt;
}
async function main() {
  const jobs: WarmJob[] = [
    { provider: "finnhub", ...(process.env.FINNHUB_API_KEY ? {} : { disabledReason: "FINNHUB_API_KEY is not configured" }), run: async () => {
      const { getQuote } = await import("../src/lib/finnhub");
      const quote = await getQuote("AAPL");
      if (!quote || !Number.isFinite(quote.price) || quote.price <= 0 || !Number.isFinite(quote.time) || quote.time <= 0) throw new Error("No quote");
      const cachedAt = fresh("finnhub:quote:AAPL");
      return { detail: `AAPL quote ${quote.price}; cache stored ${cachedAt}`, asOf: new Date(quote.time * 1000).toISOString() };
    } },
    { provider: "sec-edgar", ...(/\S+@\S+/.test(process.env.SEC_USER_AGENT ?? "") ? {} : { disabledReason: "SEC_USER_AGENT with contact required" }), run: async () => {
      const { listFilings } = await import("../src/lib/sec");
      const filings = await listFilings("0000320193");
      if (!filings.length) throw new Error("No filings");
      const cachedAt = fresh("sec:filings:0000320193");
      return { detail: `AAPL ${filings.length} filings; cache stored ${cachedAt}`, asOf: filings[0].filedAt };
    } },
    { provider: "sec-xbrl", ...(/\S+@\S+/.test(process.env.SEC_USER_AGENT ?? "") ? {} : { disabledReason: "SEC_USER_AGENT with contact required" }), run: async () => {
      const { fundamentals } = await import("../src/lib/sec");
      const facts = await fundamentals("0000320193");
      const latest = facts?.revenue.at(-1);
      if (!latest || !Number.isFinite(latest.value)) throw new Error("No revenue series");
      const cachedAt = fresh("sec:facts:v2:0000320193");
      return { detail: `AAPL revenue ${latest.value}; cache stored ${cachedAt}`, asOf: latest.end };
    } },
    // Workstream owners register their integrated provider adapters here; SKIP is never a passing check.
    ...(["sec-nport", "fred", "fdic", "stooq", "gdelt", "issuer-file"] as const).map(provider => ({ provider, disabledReason: "Provider adapter not integrated on base 4d21d34; integrator must register warmer" })),
    { provider: "alpha-vantage", disabledReason: "Disabled: no orchestrator quota authorization; never called by warm" },
  ];
  const filter = process.argv.find(arg => arg.startsWith("--providers="))?.slice("--providers=".length).split(",");
  if (filter?.some(provider => !jobs.some(job => job.provider === provider))) throw new Error("Unknown provider selection");
  const selected = filter ? jobs.filter(job => filter.includes(job.provider)) : jobs;
  if (!process.argv.includes("--live")) {
    console.table(selected.map(job => ({ provider: job.provider, status: "NOT RUN", detail: job.disabledReason ?? "Ready; --live and isolated storage environment required" })));
    return;
  }
  const forbidden = ["SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "GEMINI_API_KEY", "GEMINI_API_KEYS"];
  if (!localVerification() || !process.env.APERTURE_CACHE_DIR || forbidden.some(name => Boolean(process.env[name]))) throw new Error("Warm requires local verification, explicit shared cache, and blank remote storage/Gemini credentials");
  await withLiveLock(async () => {
    const table = await warmProviders(selected);
    await flushCacheWrites();
    console.table(table);
    console.log("Gemini: DISABLED (no calls). SKIP does not establish provider availability.");
    process.exitCode = table.some(row => row.status === "FAIL") ? 1 : table.some(row => row.status === "SKIP") ? 2 : 0;
  }, { waitMs: 0 });
}
main().catch(() => { console.error("Warm blocked: check live lock, provider selection and isolated environment; no successful run claimed."); process.exitCode = 1; });
