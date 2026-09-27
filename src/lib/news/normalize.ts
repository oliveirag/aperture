import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { publicSourceUrl, type RetrievedProvenance } from "../provenance";

export type MacroDriver = "oil-hormuz" | "tariffs" | "chip-supply";
export type NewsEvent = {
  id: string;
  headline: string;
  source: string;
  url: string;
  // Null for GDELT: seendate is the crawler's observation, not publication time.
  publishedAt: string | null;
  observedAt?: string;
  timestampBasis: "published" | "filed" | "seen";
  tickers: string[];
  eventType: "company-news" | "filing-8k" | "macro";
  drivers?: MacroDriver[];
  provenance: RetrievedProvenance;
};

export function ticker(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 16) return null;
  const normalized = value.trim().toUpperCase().replace(/[/-]/g, ".");
  return /^[A-Z][A-Z0-9.]{0,9}$/.test(normalized) ? normalized : null;
}

// Share with IC's news facts at integration; editorial analysis is not a retrieved fact.
export const PROMO = /\b(stocks?|shares?) to (buy|sell|own|avoid)\b|\bto buy (now|and hold|before)\b|\bshould you (buy|sell)\b|\bif you (invest|put|had invested)\b|\bmillionaire\b|\bup next\b|\bprice target\b|\b(buy|sell) (rating|signal)\b|\bno.brainer\b|\bmake you rich\b|\bunstoppable\b|\b(opinion|editorial|sponsored|advertorial|paid content)\b|\b(my|our) (top|favorite|favourite|best) (stock|pick|investment)\b|\b(i'm|i am|we are) buying\b|\b(strong buy|strong sell)\b|\bwill be worth\b|\binvestment split\b|\b(better|best) (buy|stock|investment)\b|\bbuy the dip\b|\bworth buying\b|\b(top|best) \d*\s*(ai |dividend |growth |tech )?stocks?\b/i;
export function isPromoOrOpinion(headline: string, source = ""): boolean {
  return PROMO.test(headline) || /\b(motley\s*fool|seeking\s*alpha)\b/i.test(source);
}

// Links are rendered, never fetched. Reject local/private literals and unsafe schemes;
// strip every query parameter not explicitly approved by the shared source contract.
export function safeArticleUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4096 || /[\u0000-\u0020\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || isIP(url.hostname) || url.hostname.includes(":")) return null;
    if (!url.hostname.includes(".") || /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname) || url.hostname.endsWith(".")) return null;
    return publicSourceUrl(url.toString());
  } catch { return null; }
}

export function eventId(url: string, accession?: string): string {
  return createHash("sha256").update(accession ? `sec:${accession}` : url).digest("hex").slice(0, 24);
}

function words(headline: string): Set<string> {
  return new Set(headline.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
}
function near(a: NewsEvent, b: NewsEvent): boolean {
  if (a.eventType !== b.eventType || a.eventType === "filing-8k") return false;
  if (a.eventType === "company-news" && !a.tickers.some(t => b.tickers.includes(t))) return false;
  const timeA = Date.parse(a.publishedAt ?? a.observedAt ?? "");
  const timeB = Date.parse(b.publishedAt ?? b.observedAt ?? "");
  if (!Number.isFinite(timeA) || !Number.isFinite(timeB) || Math.abs(timeA - timeB) > 48 * 60 * 60 * 1000) return false;
  const x = words(a.headline), y = words(b.headline);
  // Numerical revisions and negation must not be erased by fuzzy matching.
  const critical = (tokens: Set<string>) => [...tokens].filter(t => /\d|^(not|no|never|without)$/.test(t)).sort().join("|");
  if (critical(x) !== critical(y)) return false;
  const intersection = [...x].filter(t => y.has(t)).length;
  return intersection >= 4 && intersection / (x.size + y.size - intersection) >= 0.85;
}

export function deduplicateNews(events: readonly NewsEvent[]): NewsEvent[] {
  if (events.length > 10000) throw new Error("News event limit exceeded");
  const result: NewsEvent[] = [];
  const urls = new Map<string, NewsEvent>();
  const ids = new Map<string, NewsEvent>();
  const sorted = [...events].sort((a, b) => (b.publishedAt ?? b.observedAt ?? "").localeCompare(a.publishedAt ?? a.observedAt ?? ""));
  for (const event of sorted) {
    const url = safeArticleUrl(event.url);
    if (!url) continue;
    const prior = urls.get(url) ?? ids.get(event.id) ?? result.find(item => near(item, event));
    if (prior) {
      prior.tickers = [...new Set([...prior.tickers, ...event.tickers])].sort();
      urls.set(url, prior);
      ids.set(event.id, prior);
    } else {
      const item = { ...event, url, tickers: [...event.tickers] };
      result.push(item);
      urls.set(url, item);
      ids.set(event.id, item);
    }
  }
  return result;
}

// Radar adapter: macro events aren't assigned invented ticker relevance. Consumers
// must explicitly request a driver lane rather than silently showing them as issuer news.
export function forHeldTickers(events: readonly NewsEvent[], held: readonly string[], drivers: readonly MacroDriver[] = []): NewsEvent[] {
  const symbols = new Set(held.map(ticker).filter((t): t is string => t !== null));
  return deduplicateNews(events.filter(n => n.tickers.some(t => symbols.has(t)) || (n.eventType === "macro" && n.drivers?.some(d => drivers.includes(d)))));
}
