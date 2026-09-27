// Server-only live feed boundary. No database writes, webhook delivery, or opaque
// legacy cache timestamps. Raw parsers also accept recorded responses offline.
import { takeToken } from "../finnhub";
import type { RetrievedProvenance } from "../provenance";
import { ticker, forHeldTickers, type MacroDriver, type NewsEvent } from "./normalize";
import { parseFinnhubNews, parseSecAtom, parseSecSubmissions, parseGdeltNews, sourceEvidence, type CikTickers, type NewsProvenance } from "./parsers";

export const SEC_CURRENT_URL = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&output=atom";
export const GDELT_MACRO_URL = "https://api.gdeltproject.org/api/v2/doc/doc?query=%28Hormuz%20OR%20tariffs%20OR%20Taiwan%29&mode=artlist&maxrecords=50&format=json&timespan=7d";
export type NewsFeed = { items: NewsEvent[]; provenance: RetrievedProvenance };
type Provider = "finnhub" | "sec-edgar" | "gdelt";
const queues = new Map<Provider, { tail: Promise<unknown>; pending: number }>();

// One bounded queue per provider: a slow GDELT cannot block SEC or Finnhub.
// Same conservative pacing and shared Finnhub token bucket; this is NOT a new
// downstream quota. Integration CLI still locks the ENTIRE live run.
function queued<T>(provider: Provider, run: () => Promise<T>): Promise<T> {
  const queue = queues.get(provider) ?? { tail: Promise.resolve(), pending: 0 };
  if (queue.pending >= 100) return Promise.reject(new Error("News source queue at capacity"));
  queue.pending++;
  queues.set(provider, queue);
  const next = queue.tail.then(async () => { await new Promise(resolve => setTimeout(resolve, 1200)); return run(); });
  queue.tail = next.catch(() => undefined).finally(() => { queue.pending--; });
  return next;
}
async function request(provider: "finnhub" | "sec-edgar" | "gdelt", url: string): Promise<{ body: string; provenance: NewsProvenance }> {
  sourceEvidence(provider, { endpoint: url, retrievedAt: new Date().toISOString() });
  const headers: Record<string, string> = { Accept: "application/json, application/atom+xml" };
  if (provider === "finnhub") {
    const key = process.env.FINNHUB_API_KEY;
    if (!key) throw new Error("finnhub is not configured");
    headers["X-Finnhub-Token"] = key;
  }
  if (provider === "sec-edgar") {
    const agent = process.env.SEC_USER_AGENT;
    if (!agent || !/\S+@\S+/.test(agent)) throw new Error("sec-edgar requires SEC_USER_AGENT with contact address");
    headers["User-Agent"] = agent;
  }
  return queued(provider, async () => {
    if (provider === "finnhub") await takeToken();
    let response: Response;
    try { response = await fetch(url, { headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) }); }
    catch { throw new Error(`${provider} news request failed or timed out`); }
    if (!response.ok) throw new Error(`${provider} news HTTP ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error(`${provider} news empty response`);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2 * 1024 * 1024) throw new Error("response exceeds 2 MiB");
        chunks.push(value);
      }
    } catch { throw new Error(`${provider} news body unavailable or exceeds limit`); }
    finally { await reader.cancel().catch(() => undefined); }
    return { body: Buffer.concat(chunks).toString("utf8"), provenance: sourceEvidence(provider, { endpoint: url, retrievedAt: new Date().toISOString() }) };
  });
}
function json(body: string, provider: string): unknown {
  try { return JSON.parse(body); } catch { throw new Error(`${provider} returned invalid JSON`); }
}

export async function getFinnhubNews(symbol: string, days = 14): Promise<NewsFeed> {
  const normalized = ticker(symbol);
  if (!normalized || !Number.isInteger(days) || days < 1 || days > 30) throw new Error("Invalid news ticker or date range");
  const now = new Date();
  const params = new URLSearchParams({ symbol: normalized, from: new Date(+now - days * 86400000).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) });
  // Existing getCompanyNews discards retrieval/stale evidence. Reuse its shared
  // token bucket here until A can expose a provenance-bearing envelope; never
  // assign a fresh timestamp to its potentially stale cached array.
  const { body, provenance } = await request("finnhub", `https://finnhub.io/api/v1/company-news?${params}`);
  return { items: parseFinnhubNews(json(body, "finnhub"), normalized, provenance), provenance };
}
export async function getSecCompanyEvents(cik: string): Promise<NewsFeed> {
  if (!/^\d{1,10}$/.test(cik)) throw new Error("Invalid SEC CIK");
  const { body, provenance } = await request("sec-edgar", `https://data.sec.gov/submissions/CIK${cik.padStart(10, "0")}.json`);
  return { items: parseSecSubmissions(json(body, "sec-edgar"), provenance), provenance };
}
export async function getSecCurrentEvents(cikTickers: CikTickers = {}): Promise<NewsFeed> {
  const { body, provenance } = await request("sec-edgar", SEC_CURRENT_URL);
  return { items: parseSecAtom(body, provenance, cikTickers), provenance };
}
export async function getMacroEvents(): Promise<NewsFeed> {
  const { body, provenance } = await request("gdelt", GDELT_MACRO_URL);
  return { items: parseGdeltNews(json(body, "gdelt"), provenance), provenance };
}

export type FeedIssue = { source: string; status: "unavailable"; message: string };
// H/B can place these events next to filing-diff cards. Source failures stay
// visible and are not silently converted to empty successful feeds.
export async function heldTickerFeed(
  held: readonly string[],
  sources: readonly { name: string; load: () => Promise<NewsFeed> }[],
  drivers: readonly MacroDriver[] = [],
): Promise<{ items: NewsEvent[]; issues: FeedIssue[] }> {
  if (held.length > 100 || sources.length > 100) throw new Error("Held news feed limit exceeded");
  const results: { items: NewsEvent[]; issue?: FeedIssue }[] = new Array(sources.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, sources.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= sources.length) return;
      const source = sources[index];
      try { results[index] = { items: (await source.load()).items }; }
      catch { results[index] = { items: [], issue: { source: source.name, status: "unavailable", message: "News source unavailable; no substitute generated" } }; }
    }
  }));
  // Preserve caller order for equal-date ties and visible source failures.
  return { items: forHeldTickers(results.flatMap(r => r.items), held, drivers), issues: results.flatMap(r => r.issue ? [r.issue] : []) };
}
