import { assertProvenance, publicSourceUrl, type RetrievedProvenance } from "../provenance";
import type { NewsItem } from "../finnhub";
import { deduplicateNews, eventId, isPromoOrOpinion, safeArticleUrl, ticker, type MacroDriver, type NewsEvent } from "./normalize";

export type FeedEvidence = { endpoint: string; retrievedAt: string; stale?: boolean };
export type NewsProvenance = RetrievedProvenance & { endpoint: string };
export type CikTickers = Readonly<Record<string, readonly string[]>>;
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max = 1000): string | null => typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) ? value.trim() : null;

export function sourceEvidence(provider: "finnhub" | "sec-edgar" | "gdelt", context: FeedEvidence): NewsProvenance {
  const url = new URL(context.endpoint);
  const expected = provider === "finnhub" ? url.hostname === "finnhub.io" && url.pathname === "/api/v1/company-news"
    : provider === "gdelt" ? url.hostname === "api.gdeltproject.org" && url.pathname === "/api/v2/doc/doc"
    : (url.hostname === "data.sec.gov" && /^\/submissions\/CIK\d{10}\.json$/.test(url.pathname)) || (url.hostname === "www.sec.gov" && url.pathname === "/cgi-bin/browse-edgar");
  if (!expected || url.port || url.username || url.password || url.protocol !== "https:") throw new Error("Untrusted news provider endpoint");
  const provenance: NewsProvenance = { kind: "retrieved", provider, endpoint: publicSourceUrl(context.endpoint), retrievedAt: context.retrievedAt, ...(context.stale === undefined ? {} : { stale: context.stale }) };
  assertProvenance(provenance);
  return provenance;
}

function date(value: unknown, retrievedAt: string): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return null;
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || millis > Date.parse(retrievedAt) + 5 * 60 * 1000) return null;
  try { assertProvenance({ kind: "assumption", source: "date validation", rationale: "internal validation only", asOf: value }); } catch { return null; }
  return value.includes("T") ? new Date(millis).toISOString() : value;
}

export function parseFinnhubNews(body: unknown, symbol: string, context: FeedEvidence): NewsEvent[] {
  const base = sourceEvidence("finnhub", context);
  const held = ticker(symbol);
  if (!held) throw new Error("Invalid company news symbol");
  if (!Array.isArray(body) || body.length > 10000) throw new Error("Invalid Finnhub news response");
  const items: NewsEvent[] = [];
  for (const value of body) {
    const row = record(value);
    const headline = text(row.headline), source = text(row.source, 200), url = safeArticleUrl(row.url);
    if (!headline || !source || !url || isPromoOrOpinion(headline, source)) continue;
    if (typeof row.datetime !== "number" || !Number.isSafeInteger(row.datetime) || row.datetime <= 0 || row.datetime > 8640000000000) continue;
    const publishedAt = date(new Date(row.datetime * 1000).toISOString(), context.retrievedAt);
    if (!publishedAt) continue;
    const related = typeof row.related === "string" && row.related.length <= 2000 ? row.related.split(",").map(ticker).filter((t): t is string => t !== null) : [];
    items.push({ id: eventId(url), headline, source, url, publishedAt, timestampBasis: "published", tickers: [...new Set([held, ...related])], eventType: "company-news", provenance: { ...base, asOf: publishedAt } });
  }
  return deduplicateNews(items);
}

// Adapter for A's existing getCompanyNews return type. The caller MUST supply the
// original retrieval evidence; Date.now() at a cache read is not acceptable.
export function adaptCompanyNews(items: readonly NewsItem[], symbol: string, evidence: FeedEvidence): NewsEvent[] {
  return parseFinnhubNews(items, symbol, evidence);
}

export function parseSecSubmissions(body: unknown, context: FeedEvidence): NewsEvent[] {
  const base = sourceEvidence("sec-edgar", context);
  const root = record(body);
  const cik = typeof root.cik === "number" ? String(root.cik).padStart(10, "0") : typeof root.cik === "string" ? root.cik.padStart(10, "0") : "";
  const recent = record(record(root.filings).recent);
  const forms = recent.form;
  const name = text(root.name);
  if (!/^\d{10}$/.test(cik) || !name || !Array.isArray(forms) || forms.length > 10000 || !Array.isArray(root.tickers)) throw new Error("Invalid SEC submissions response");
  if (new URL(context.endpoint).pathname !== `/submissions/CIK${cik}.json`) throw new Error("SEC submissions CIK does not match evidence");
  const symbols = root.tickers.map(ticker).filter((t): t is string => t !== null);
  const field = (key: string, index: number) => Array.isArray(recent[key]) ? recent[key][index] : undefined;
  const items: NewsEvent[] = [];
  for (let i = 0; i < forms.length; i++) {
    const form = forms[i];
    if (form !== "8-K" && form !== "8-K/A") continue;
    const accession = field("accessionNumber", i), document = field("primaryDocument", i);
    const filedAt = date(field("filingDate", i), context.retrievedAt);
    const publishedAt = date(field("acceptanceDateTime", i), context.retrievedAt) ?? filedAt;
    if (typeof accession !== "string" || !/^\d{10}-\d{2}-\d{6}$/.test(accession) || typeof document !== "string" || !/^[a-zA-Z0-9_.-]+\.(?:htm|html|txt)$/.test(document) || document.includes("..") || !filedAt || !publishedAt) continue;
    const url = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replaceAll("-", "")}/${document}`;
    const provenance: RetrievedProvenance = { ...base, asOf: publishedAt, filing: { cik, accession, form, filedAt, url } };
    assertProvenance(provenance);
    items.push({ id: eventId(url, accession), headline: `${name} — ${form} current report`, source: "SEC EDGAR", url, publishedAt, timestampBasis: "filed", tickers: symbols, eventType: "filing-8k", provenance });
  }
  return deduplicateNews(items);
}

// Narrow parser for the SEC's flat Atom export, not a general-purpose XML parser.
// No DTD/entity expansion or embedded HTML is executed. HTML summaries are ignored.
function xmlText(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, entity => {
    const named: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
    if (named[entity]) return named[entity];
    const code = entity.startsWith("&#x") ? parseInt(entity.slice(3), 16) : parseInt(entity.slice(2), 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  }).trim();
}
export function parseSecAtom(body: string, context: FeedEvidence, cikTickers: CikTickers = {}): NewsEvent[] {
  const base = sourceEvidence("sec-edgar", context);
  if (new URL(context.endpoint).hostname !== "www.sec.gov" || typeof body !== "string" || body.length > 2 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(body) || !/<feed\s[^>]*xmlns=["']http:\/\/www\.w3\.org\/2005\/Atom["']/.test(body) || !/<\/feed>\s*$/.test(body)) throw new Error("Invalid SEC Atom response");
  const items: NewsEvent[] = [];
  for (const [, entry] of body.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)) {
    const tag = (name: string) => xmlText(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`).exec(entry)?.[1] ?? "");
    const headline = text(tag("title"));
    const form = /<category\b[^>]*\bterm=["'](8-K(?:\/A)?)["']/.exec(entry)?.[1];
    const publishedAt = date(tag("updated"), context.retrievedAt);
    const accession = /accession-number=(\d{10}-\d{2}-\d{6})/.exec(tag("id"))?.[1];
    const rawUrl = /<link\b[^>]*\bhref=["']([^"']+)["']/.exec(entry)?.[1];
    const url = safeArticleUrl(rawUrl ? xmlText(rawUrl) : null);
    if (!headline || !form || !publishedAt || !accession || !url) continue;
    const target = new URL(url);
    const path = /^\/Archives\/edgar\/data\/(\d{1,10})\/(\d{18})\/[^/]+$/.exec(target.pathname);
    if (target.hostname !== "www.sec.gov" || !path || path[2] !== accession.replaceAll("-", "")) continue;
    const cik = path[1].padStart(10, "0");
    const filedAt = date(/Filed:(?:&lt;\/b&gt;|<\/b>)?\s*(\d{4}-\d{2}-\d{2})/.exec(entry)?.[1], context.retrievedAt) ?? publishedAt.slice(0, 10);
    const provenance: RetrievedProvenance = { ...base, asOf: publishedAt, filing: { cik, accession, form, filedAt, url } };
    assertProvenance(provenance);
    const symbols = (cikTickers[cik] ?? cikTickers[String(Number(cik))] ?? []).map(ticker).filter((t): t is string => t !== null);
    items.push({ id: eventId(url, accession), headline, source: "SEC EDGAR", url, publishedAt, timestampBasis: "filed", tickers: [...new Set(symbols)], eventType: "filing-8k", provenance });
  }
  return deduplicateNews(items);
}

export function parseGdeltNews(body: unknown, context: FeedEvidence): NewsEvent[] {
  const base = sourceEvidence("gdelt", context);
  const articles = record(body).articles;
  if (!Array.isArray(articles) || articles.length > 250) throw new Error("Invalid GDELT article response");
  const items: NewsEvent[] = [];
  for (const value of articles) {
    const row = record(value);
    const headline = text(row.title), url = safeArticleUrl(row.url), source = text(row.domain, 253);
    if (!headline || !url || !source || isPromoOrOpinion(headline, source)) continue;
    if (new URL(url).hostname !== source.toLowerCase()) continue;
    const seen = typeof row.seendate === "string" ? /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(row.seendate) : null;
    const observedAt = seen ? date(`${seen[1]}-${seen[2]}-${seen[3]}T${seen[4]}:${seen[5]}:${seen[6]}Z`, context.retrievedAt) : null;
    if (!observedAt) continue;
    const drivers: MacroDriver[] = [];
    if (/\b(hormuz|crude|oil)\b/i.test(headline)) drivers.push("oil-hormuz");
    if (/\btariffs?\b/i.test(headline)) drivers.push("tariffs");
    if (/\b(taiwan|tsmc|semiconductors?)\b/i.test(headline)) drivers.push("chip-supply");
    if (!drivers.length) continue;
    items.push({ id: eventId(url), headline, source, url, publishedAt: null, observedAt, timestampBasis: "seen", tickers: [], eventType: "macro", drivers, provenance: { ...base, asOf: observedAt } });
  }
  return deduplicateNews(items);
}
