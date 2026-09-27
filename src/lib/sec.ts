// Server-only SEC EDGAR client. Pure parsers live in sec/ and share real-fixture checks.
import { memo } from "@/lib/cache";
import type { RetrievedProvenance } from "@/lib/provenance";
import { dedupeFilings, normalizeCik, parseFilings, type Filing, type SecFiling, type Submissions, type SubmissionRows, type SupportedFilingForm } from "./sec/filings";
import { extractItem } from "./sec/sections";
import { fundamentalsFromFacts, parseFrame, type CompanyFacts, type Fundamentals, type XbrlFrame } from "./sec/xbrl";
import { filingSearchUrl, parseFilingSearch, type FilingSearchQuery, type SearchResponse } from "./sec/search";
import { parseSegmentRevenue } from "./sec/segments";
export * from "./sec/filings";
export * from "./sec/sections";
export * from "./sec/xbrl";
export * from "./sec/search";
export * from "./sec/segments";

const TIMEOUT_MS = 20000;
const MIN_GAP_MS = 120;
const DAY = 86400000;
const HOUR = 3600000;
export interface Company { cik: string; name: string; ticker: string }
let queue: Promise<unknown> = Promise.resolve();
function throttled<T>(run: () => Promise<T>): Promise<T> {
  const next = queue.then(() => new Promise(r => setTimeout(r, MIN_GAP_MS)), () => new Promise(r => setTimeout(r, MIN_GAP_MS)));
  const result = next.then(run);
  queue = result.catch(() => undefined);
  return result;
}
const RETRY_MS = [800, 2500];
async function secFetch(url: string): Promise<Response> {
  const target = new URL(url);
  if (target.protocol !== "https:" || target.username || target.password || target.port || !["www.sec.gov", "data.sec.gov", "efts.sec.gov"].includes(target.hostname)) throw new Error("Untrusted SEC endpoint");
  const userAgent = process.env.SEC_USER_AGENT;
  if (!userAgent || !/\S+@\S+/.test(userAgent)) throw new Error("SEC_USER_AGENT with contact email is required");
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    let error: unknown = null;
    try {
      res = await throttled(() => fetch(target, { headers: { "User-Agent": userAgent, Accept: "application/json, text/html" }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store", redirect: "error" }));
    } catch (err) { error = err; }
    if (res?.ok) return res;
    const retryable = error !== null || res?.status === 429 || (res?.status ?? 0) >= 500;
    if (!retryable || attempt >= RETRY_MS.length) throw new Error(`sec ${target.pathname} ${res?.status ?? "network error"}`);
    await new Promise(r => setTimeout(r, RETRY_MS[attempt]));
  }
}
type TickerRow = { cik_str: number; ticker: string; title: string };
function tickerMap() {
  return memo("sec:tickers", DAY, async () => {
    const res = await secFetch("https://www.sec.gov/files/company_tickers.json");
    const rows = Object.values(await res.json() as Record<string, TickerRow>);
    const map = new Map<string, Company>();
    for (const r of rows) {
      const ticker = r.ticker.toUpperCase().replace(/-/g, ".");
      if (!map.has(ticker)) map.set(ticker, { cik: String(r.cik_str).padStart(10, "0"), name: r.title, ticker });
    }
    return map;
  });
}
export function displayName(name: string) {
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().split(/\s+/).map(w => w.length <= 3 && /[&.]/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
export async function allCompanies(): Promise<Company[]> { return [...(await tickerMap()).values()]; }
export async function companyFor(ticker: string): Promise<Company | null> {
  const map = await tickerMap();
  const t = ticker.toUpperCase().replace(/-/g, ".");
  return map.get(t) ?? map.get(t.replace(/\./g, "")) ?? null;
}

async function submissions(cik: string) {
  const endpoint = `https://data.sec.gov/submissions/CIK${normalizeCik(cik)}.json`;
  const response = await secFetch(endpoint);
  return { data: await response.json() as Submissions, retrieval: { endpoint, retrievedAt: new Date().toISOString() } };
}
// Legacy default stays recent domestic reports so consumers with 10-K/10-Q UI contracts remain compatible.
export function listFilings(cik: string): Promise<Filing[]> {
  cik = normalizeCik(cik);
  return memo(`sec:filings:${cik}`, 6 * HOUR, async () => {
    const { data, retrieval } = await submissions(cik);
    return data.filings?.recent ? parseFilings(data.filings.recent, cik, retrieval).filter((f): f is SecFiling & Filing => f.form === "10-K" || f.form === "10-Q") : [];
  }, { persist: true });
}
// Full supported history, including foreign forms, amendments, 8-K items, and every older submissions page.
// Fail on an unavailable page rather than silently claiming a partial history is complete.
export function listFilingHistory(cik: string, options: { recentOnly?: boolean } = {}): Promise<SecFiling[]> {
  cik = normalizeCik(cik);
  return memo(`sec:history:v1:${cik}:${options.recentOnly ? "recent" : "all"}`, 6 * HOUR, async () => {
    const { data, retrieval } = await submissions(cik);
    const filings = data.filings?.recent ? parseFilings(data.filings.recent, cik, retrieval) : [];
    if (!options.recentOnly) for (const file of data.filings?.files ?? []) {
      if (!/^CIK\d{10}-submissions-\d+\.json$/.test(file.name) || !file.name.startsWith(`CIK${cik}-`)) throw new Error("Invalid SEC history filename");
      const endpoint = `https://data.sec.gov/submissions/${file.name}`;
      const response = await secFetch(endpoint);
      const rows = await response.json() as SubmissionRows;
      filings.push(...parseFilings(rows, cik, { endpoint, retrievedAt: new Date().toISOString() }));
    }
    return dedupeFilings(filings);
  }, { persist: true });
}
export function filingPair(filings: Filing[]): { latest: Filing; prior: Filing } | null {
  for (const form of ["10-K", "10-Q"] as const) {
    const same = filings.filter(f => f.form === form).sort((a, b) => b.filedAt.localeCompare(a.filedAt));
    const prior = same.slice(1).find(f => !same[0].reportDate || f.reportDate !== same[0].reportDate);
    if (same[0] && prior) return { latest: same[0], prior };
  }
  return null;
}
const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", bull: "•", hellip: "…", reg: "®", trade: "™", copy: "©" };
function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : " ";
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}
export function htmlToText(html: string) {
  return decodeEntities(html.replace(/<ix:header[\s\S]*?<\/ix:header>/gi, " ").replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h[1-6]|table|section)>/gi, "\n").replace(/<(td|th)[^>]*>/gi, " ").replace(/<[^>]+>/g, ""))
    .replace(/[ \t ​]+/g, " ").replace(/ *\n */g, "\n").replace(/\n+(?:\d{1,3}\n+)?Table of Contents\n+/gi, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
export function normalizeForMatch(s: string) {
  return s.replace(/[‘’‛′]/g, "'").replace(/[“”‟″]/g, '"').replace(/[‐‑‒–—−]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
}
export const MAX_SECTION = 150000;
export type Section = { name: string; text: string; found: boolean };
export function extractSection(text: string, form: SupportedFilingForm): Section {
  const annual = form === "10-K" || form === "10-K/A";
  if (annual) {
    const risk = extractItem(text, form, "1A");
    if (risk.found) return { name: "Item 1A. Risk Factors", text: risk.text.slice(0, MAX_SECTION), found: true };
  } else if (form.startsWith("10-Q")) {
    const mda = extractItem(text, form, "2", "I");
    const risk = extractItem(text, form, "1A", "II");
    const parts = [mda, risk].filter(p => p.found);
    if (parts.length) return { name: parts.map(p => p.name).join(" and "), text: parts.map(p => p.text).join("\n\n").slice(0, MAX_SECTION), found: true };
  } else if (form.startsWith("20-F")) {
    const risks = extractItem(text, form, "3");
    if (risks.found) return { name: "Item 3. Key Information (including Risk Factors)", text: risks.text.slice(0, MAX_SECTION), found: true };
  }
  return { name: "Full filing (section not located)", text: text.slice(0, MAX_SECTION * 2), found: false };
}
export function extractBusiness(text: string): string | null {
  const section = extractItem(text, "10-K", "1");
  return section.found ? section.text : null;
}
function documentUrl(filing: Filing<SupportedFilingForm>) {
  // Reject untrusted user URLs and index-only history rows before entering a URL-independent cache.
  const url = new URL(filing.url);
  if (!/^\d{10}-\d{2}-\d{6}$/.test(filing.accession) || url.origin !== "https://www.sec.gov" || !/^\/Archives\/edgar\/data\/\d+\/\d{18}\/[\w.-]+$/.test(url.pathname) || url.search || url.hash || url.username || url.password || !url.pathname.includes(`/${filing.accession.replace(/-/g, "")}/`) || url.pathname.endsWith("-index.htm")) throw new Error("Filing document unavailable or invalid");
  return url;
}
export type FilingDocument = { text: string; provenance: RetrievedProvenance };
export function filingDocument(filing: Filing<SupportedFilingForm>): Promise<FilingDocument> {
  const url = documentUrl(filing);
  return memo(`sec:document:v1:${url.pathname}`, 7 * DAY, async () => {
    const text = htmlToText(await (await secFetch(filing.url)).text());
    return { text, provenance: { kind: "retrieved", provider: "sec-edgar", endpoint: filing.url, retrievedAt: new Date().toISOString(), asOf: filing.filedAt,
      filing: { cik: normalizeCik(url.pathname.split("/")[4]), accession: filing.accession, form: filing.form, filedAt: filing.filedAt, url: filing.url } } };
  });
}
export async function filingText(filing: Filing<SupportedFilingForm>): Promise<string> {
  return (await filingDocument(filing)).text;
}
export function filingSegments(filing: SecFiling) {
  const url = documentUrl(filing);
  return memo(`sec:segments:v1:${url.pathname}`, 7 * DAY, async () => {
    const html = await (await secFetch(url.toString())).text();
    return parseSegmentRevenue(html, filing, { endpoint: filing.url, retrievedAt: new Date().toISOString() });
  });
}
export function fundamentals(cik: string): Promise<Fundamentals | null> {
  cik = normalizeCik(cik);
  return memo(`sec:facts:v2:${cik}`, DAY, async () => {
    const endpoint = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    const response = await secFetch(endpoint);
    const data = await response.json() as CompanyFacts;
    if (Number(data.cik) !== Number(cik)) throw new Error("SEC companyfacts CIK mismatch");
    return fundamentalsFromFacts(data, { endpoint, retrievedAt: new Date().toISOString() });
  }, { persist: true });
}
export function searchFilings(options: FilingSearchQuery) {
  const endpoint = filingSearchUrl(options);
  return memo(`sec:search:v1:${endpoint}`, HOUR, async () => {
    const response = await secFetch(endpoint);
    return { ...parseFilingSearch(await response.json() as SearchResponse, { endpoint: "https://efts.sec.gov/LATEST/search-index", retrievedAt: new Date().toISOString() }), query: options };
  });
}
// EFTS hits establish only a document match. Fetch the document before providing any quote.
// A literal phrase is used here, not EFTS boolean syntax; absence is an explicit unverified result.
export async function searchFilingEvidence(options: FilingSearchQuery) {
  const phrase = options.query.replace(/^"|"$/g, "").trim();
  if (!phrase || /[(){}*]/.test(phrase)) throw new Error("Evidence search requires a literal phrase");
  const result = await searchFilings(options);
  const evidence = [];
  for (const hit of result.hits.slice(0, 5)) {
    const text = await filingText(hit.filing);
    const section = extractSection(text, hit.filing.form);
    const inSection = section.found && section.text.toLowerCase().includes(phrase.toLowerCase());
    const source = inSection ? section.text : text;
    const at = source.toLowerCase().indexOf(phrase.toLowerCase());
    const start = at < 0 ? 0 : Math.max(0, source.lastIndexOf("\n", at) + 1);
    let end = at < 0 ? 0 : source.indexOf("\n", at + phrase.length);
    if (end < 0) end = source.length;
    // Do not alter or append ellipses to a quote. Long paragraphs are clipped as an exact source slice.
    const quote = at < 0 ? null : source.slice(Math.max(start, at - 150), Math.min(end, at + phrase.length + 300));
    evidence.push({ ...hit, evidenceStatus: quote ? "verified-source-quote" as const : "document-match-not-verified-quote" as const, quote, quoteVerified: !!quote && text.includes(quote), section: inSection ? section.name : "Full filing", url: hit.filing.url });
  }
  return { ...result, evidence };
}
export function xbrlFrame(taxonomy: "us-gaap" | "ifrs-full", tag: string, unit: string, period: string) {
  if (!["us-gaap", "ifrs-full"].includes(taxonomy) || !/^[A-Za-z][A-Za-z0-9]{0,150}$/.test(tag) || !/^[A-Za-z][A-Za-z0-9-]{0,40}$/.test(unit) || !/^CY\d{4}(?:Q[1-4])?I?$/.test(period)) throw new Error("Invalid XBRL frame parameters");
  const endpoint = `https://data.sec.gov/api/xbrl/frames/${taxonomy}/${tag}/${unit}/${period}.json`;
  return memo(`sec:frame:v1:${endpoint}`, DAY, async () => parseFrame(await (await secFetch(endpoint)).json() as XbrlFrame, { endpoint, retrievedAt: new Date().toISOString() }));
}
