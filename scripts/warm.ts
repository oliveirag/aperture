// Warms every provider call the demo makes, so the cache (memory and .next/cache/aperture) holds a good copy of each
// before presenting. Run against a running server: npm run warm [baseUrl]. Exits non-zero if any step fails.
import { readFile } from "node:fs/promises";
import { HOLDINGS } from "../src/data/portfolio";
import { IC_AMOUNT, IC_THESIS, IC_TICKER } from "../src/data/ic-room";

const base = process.argv[2] ?? "http://localhost:3000";
const holdings = HOLDINGS.map(({ ticker, shares, price, name }) => ({ ticker, shares, price, name }));
const stocks = HOLDINGS.filter((h) => h.type === "stock").map((h) => h.ticker);
let failed = 0;

async function step(label: string, run: () => Promise<Response>, check: (text: string) => string | null = () => null) {
  const t0 = Date.now();
  try {
    const res = await run();
    const text = await res.text();
    const problem = !res.ok ? `HTTP ${res.status}: ${text.slice(0, 120)}` : check(text);
    if (problem) throw new Error(problem);
    console.log(`ok    ${label} (${Date.now() - t0} ms)`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${label}: ${err instanceof Error ? err.message : err}`);
  }
}

const post = (path: string, body: unknown) => () =>
  fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
// NDJSON streams report per-item errors inside a 200 response.
const noErrorLines = (text: string) => {
  const bad = text.split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.type === "error");
  return bad.length ? bad.map((e) => `${e.ticker ?? ""} ${e.error}`).join("; ") : null;
};

(async () => {
  console.log(`Warming ${base}`);
  await step("market quotes", () => fetch(`${base}/api/market?symbols=${HOLDINGS.map((h) => h.ticker).join(",")}&fields=quote,profile`));
  await step("X-Ray look-through", post("/api/aperture", { holdings }));
  await step("Shock scenarios", post("/api/shock", { holdings }));
  await step("performance (1Y weekly)", post("/api/performance", { holdings }));
  for (const h of HOLDINGS.filter((x) => x.type === "stock")) await step(`historical range ${h.ticker}`, post("/api/outlook", { ticker: h.ticker, price: h.price }));
  for (let i = 0; i < stocks.length; i += 3) await step(`Filing Radar ${stocks.slice(i, i + 3).join(", ")}`, post("/api/radar", { tickers: stocks.slice(i, i + 3) }), noErrorLines);
  for (const question of ["What if Iran closes the Strait of Hormuz?", "What if Democrats win and tariffs go down?", "Taiwan chip supply drops 30%", "the dollar strengthens 10%"]) {
    await step(`scenario: ${question}`, post("/api/shock/research", { question, demo: true }));
  }
  await step(`IC Room ${IC_TICKER.ticker}`, post("/api/ic/run", { ticker: IC_TICKER.ticker, thesis: IC_THESIS, amount: IC_AMOUNT, holdings }), noErrorLines);
  const png = await readFile(new URL("../public/demo/brokerage-positions.png", import.meta.url));
  await step("sample screenshot read", () => {
    const form = new FormData();
    form.append("file", new Blob([png], { type: "image/png" }), "brokerage-positions.png");
    return fetch(`${base}/api/snap`, { method: "POST", body: form });
  }, (text) => (JSON.parse(text).holdings?.length === HOLDINGS.length ? null : `read ${JSON.parse(text).holdings?.length ?? 0} of ${HOLDINGS.length} positions`));
  console.log(failed ? `\n${failed} step(s) failed. Fix or re-run before presenting.` : "\nAll steps warm.");
  process.exit(failed ? 1 : 0);
})();
