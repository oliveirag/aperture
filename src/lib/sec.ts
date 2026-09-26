// Server-only SEC EDGAR client: ticker to CIK, filing lists, and filing text with the risk sections cut out.
// SEC asks for a descriptive User-Agent with a contact address and at most 10 requests a second.
import { memo } from "@/lib/cache";

const USER_AGENT = process.env.SEC_USER_AGENT || "Lookthrough research app admin@lookthrough.app";
const TIMEOUT_MS = 20000;
const MIN_GAP_MS = 120;
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

export type FilingForm = "10-K" | "10-Q";

export interface Filing {
  form: FilingForm;
  accession: string;
  filedAt: string;
  // Period of report, e.g. the fiscal year end.
  reportDate: string;
  url: string;
  indexUrl: string;
}

export interface Company {
  cik: string;
  name: string;
  ticker: string;
}

// One request at a time with a small gap keeps every instance under SEC's 10/s limit.
let queue: Promise<unknown> = Promise.resolve();
function throttled<T>(run: () => Promise<T>): Promise<T> {
  const next = queue.then(
    () => new Promise((r) => setTimeout(r, MIN_GAP_MS)),
    () => new Promise((r) => setTimeout(r, MIN_GAP_MS)),
  );
  const result = next.then(run);
  queue = result.catch(() => undefined);
  return result;
}

async function secFetch(url: string): Promise<Response> {
  const res = await throttled(() =>
    fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/html" }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" }),
  );
  if (!res.ok) throw new Error(`sec ${new URL(url).pathname} ${res.status}`);
  return res;
}

type TickerRow = { cik_str: number; ticker: string; title: string };

function tickerMap() {
  return memo("sec:tickers", DAY, async () => {
    const res = await secFetch("https://www.sec.gov/files/company_tickers.json");
    const rows = Object.values((await res.json()) as Record<string, TickerRow>);
    const map = new Map<string, Company>();
    for (const r of rows) {
      const ticker = r.ticker.toUpperCase().replace(/-/g, ".");
      // The file lists the primary ticker first; keep it.
      if (!map.has(ticker)) map.set(ticker, { cik: String(r.cik_str).padStart(10, "0"), name: r.title, ticker });
    }
    return map;
  });
}

export async function companyFor(ticker: string): Promise<Company | null> {
  const map = await tickerMap();
  const t = ticker.toUpperCase();
  return map.get(t) ?? map.get(t.replace(/\./g, "")) ?? null;
}

type Recent = { form: string[]; accessionNumber: string[]; filingDate: string[]; reportDate: string[]; primaryDocument: string[] };

// Every 10-K and 10-Q in the company's recent filings, newest first.
export function listFilings(cik: string): Promise<Filing[]> {
  return memo(`sec:filings:${cik}`, 6 * HOUR, async () => {
    const res = await secFetch(`https://data.sec.gov/submissions/CIK${cik}.json`);
    const recent = ((await res.json()) as { filings?: { recent?: Recent } }).filings?.recent;
    if (!recent) return [];
    const out: Filing[] = [];
    const cikNum = String(Number(cik));
    for (let i = 0; i < recent.form.length; i++) {
      const form = recent.form[i];
      if (form !== "10-K" && form !== "10-Q") continue;
      const accession = recent.accessionNumber[i];
      const folder = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accession.replace(/-/g, "")}`;
      out.push({
        form,
        accession,
        filedAt: recent.filingDate[i],
        reportDate: recent.reportDate[i],
        url: `${folder}/${recent.primaryDocument[i]}`,
        indexUrl: `${folder}/${accession}-index.htm`,
      });
    }
    return out.sort((a, b) => b.filedAt.localeCompare(a.filedAt));
  });
}

// The latest filing and the prior one of the same form. Annual reports are preferred: they carry the full risk factors.
export function filingPair(filings: Filing[]): { latest: Filing; prior: Filing } | null {
  for (const form of ["10-K", "10-Q"] as const) {
    const same = filings.filter((f) => f.form === form);
    if (same.length >= 2) return { latest: same[0], prior: same[1] };
  }
  return null;
}

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  mdash: "—",
  ndash: "–",
  bull: "•",
  hellip: "…",
  reg: "®",
  trade: "™",
  copy: "©",
};

function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : " ";
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

// Inline XBRL HTML to readable text: hidden XBRL headers, scripts and styles dropped, blocks become line breaks.
export function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<ix:header[\s\S]*?<\/ix:header>/gi, " ")
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h[1-6]|table|section)>/gi, "\n")
      .replace(/<(td|th)[^>]*>/gi, " ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t ​]+/g, " ")
    .replace(/ *\n */g, "\n")
    // Page breaks leave "13 / Table of Contents" in the middle of sentences.
    .replace(/\n+(?:\d{1,3}\n+)?Table of Contents\n+/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// For comparing quotes with the filing: one kind of space, quote and dash.
export function normalizeForMatch(s: string) {
  return s
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

type Span = { start: number; end: number };

// The longest span between a heading and the next heading, so the table of contents (a short span) loses to the body.
function longestSpan(text: string, start: RegExp, end: RegExp): Span | null {
  let best: Span | null = null;
  for (const m of text.matchAll(start)) {
    const from = m.index ?? 0;
    end.lastIndex = from + m[0].length;
    const stop = end.exec(text);
    const to = stop ? stop.index : Math.min(text.length, from + 400000);
    if (!best || to - from > best.end - best.start) best = { start: from, end: to };
  }
  return best;
}

// Headings start a line; in-text cross-references ("see Item 1A. Risk Factors,” ...) don't.
const heading = (body: string) => new RegExp(`(?:^|\\n)[ \\t]*(?:part\\s+i+\\s*[,.-]?\\s*)?item\\s*${body}(?![’”"'\\w])`, "gi");
const SEP = "\\.?\\s*[-–—:.]?\\s*";
const RISK_START = heading(`1a${SEP}risk\\s+factors`);
const RISK_END_10K = heading(`(?:1b|1c|2)${SEP}(?:unresolved|cybersecurity|properties)`);
const RISK_END_10Q = heading(`(?:2|3|4|5|6)${SEP}(?:unregistered|defaults|mine|other\\s+information|exhibits)`);
const MDA_START = heading(`2${SEP}management[’']?s\\s+discussion`);
const MDA_END = heading(`(?:3${SEP}quantitative|4${SEP}controls)`);

// Shortest section we trust as the real thing rather than a table-of-contents line or a cross-reference.
const MIN_SECTION = 2000;
export const MAX_SECTION = 150000;

export type Section = { name: string; text: string; found: boolean };

// Risk Factors for a 10-K; Risk Factors plus MD&A for a 10-Q (quarterly risk sections are often one line pointing at the 10-K).
// found=false means the headings weren't located and `text` is the start of the whole filing instead.
export function extractSection(text: string, form: FilingForm): Section {
  if (form === "10-K") {
    const span = longestSpan(text, RISK_START, RISK_END_10K);
    if (span && span.end - span.start >= MIN_SECTION) return { name: "Item 1A. Risk Factors", text: text.slice(span.start, span.end).trim().slice(0, MAX_SECTION), found: true };
  } else {
    const risk = longestSpan(text, RISK_START, RISK_END_10Q);
    const mda = longestSpan(text, MDA_START, MDA_END);
    const parts: string[] = [];
    if (mda && mda.end - mda.start >= MIN_SECTION) parts.push(text.slice(mda.start, mda.end).trim());
    if (risk && risk.end - risk.start >= 200) parts.push(text.slice(risk.start, risk.end).trim());
    const joined = parts.join("\n\n");
    if (joined.length >= MIN_SECTION) {
      return { name: parts.length === 2 ? "MD&A and Part II, Item 1A" : "Item 2. MD&A", text: joined.slice(0, MAX_SECTION), found: true };
    }
  }
  return { name: "Full filing", text: text.slice(0, MAX_SECTION * 2), found: false };
}

// Filing text, cached by accession: filings never change once published.
export function filingText(filing: Filing): Promise<string> {
  return memo(`sec:text:${filing.accession}`, 7 * DAY, async () => {
    const res = await secFetch(filing.url);
    return htmlToText(await res.text());
  });
}
