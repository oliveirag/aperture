// Server-only SEC EDGAR client: ticker -> CIK, annual filings, filing text and the Risk Factors section.
// EDGAR asks for a descriptive User-Agent with contact info and at most 10 requests/second.

const UA = process.env.SEC_USER_AGENT || "Lookthrough/1.0 research app (+https://github.com/oliveirag/lookthru)";
const MIN_GAP_MS = 125; // <= 8 requests/second, under EDGAR's 10/s limit
const TIMEOUT_MS = 20000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type Filing = { form: string; accession: string; filedAt: string; url: string; indexUrl: string };

// One queue for every EDGAR request so parallel radar lookups can't exceed the rate limit.
let chain: Promise<unknown> = Promise.resolve();
let last = 0;
function secFetch(url: string): Promise<Response> {
  const run = chain.then(async () => {
    const wait = last + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) throw new Error(`SEC ${res.status} for ${new URL(url).pathname}`);
    return res;
  });
  chain = run.catch(() => undefined);
  return run;
}

const memo = new Map<string, { expires: number; value: Promise<unknown> }>();
function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
  const value = load();
  memo.set(key, { expires: Date.now() + ttl, value });
  value.catch(() => memo.delete(key));
  return value;
}

// EDGAR writes class shares with a dash (BRK-B); we use a dot (BRK.B).
const edgarTicker = (t: string) => t.toUpperCase().replace(/\./g, "-");

export function getCik(ticker: string): Promise<string | null> {
  return cached("tickers", DAY_MS, async () => {
    const data = (await (await secFetch("https://www.sec.gov/files/company_tickers.json")).json()) as Record<string, { cik_str: number; ticker: string }>;
    return new Map(Object.values(data).map((r) => [r.ticker.toUpperCase(), String(r.cik_str).padStart(10, "0")]));
  }).then((map) => map.get(edgarTicker(ticker)) ?? null);
}

type FilingColumns = { form: string[]; accessionNumber: string[]; filingDate: string[]; primaryDocument: string[] };
type Submissions = { name: string; filings: { recent: FilingColumns; files?: { name: string; filingFrom: string; filingTo: string }[] } };

function annual(cik: string, cols: FilingColumns): Filing[] {
  const out: Filing[] = [];
  for (let i = 0; i < cols.form.length; i++) {
    if (cols.form[i] !== "10-K") continue;
    const folder = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${cols.accessionNumber[i].replace(/-/g, "")}`;
    out.push({
      form: cols.form[i],
      accession: cols.accessionNumber[i],
      filedAt: cols.filingDate[i],
      url: `${folder}/${cols.primaryDocument[i]}`,
      indexUrl: `${folder}/${cols.accessionNumber[i]}-index.htm`,
    });
  }
  return out;
}

// The company's name and its most recent 10-K filings, newest first. Heavy filers (JPMorgan files ~2,000 documents a
// month) push the prior 10-K out of "recent" into monthly history pages; only the pages dated 9-15 months before the
// latest 10-K are read.
export function getAnnualReports(cik: string): Promise<{ name: string; filings: Filing[] }> {
  return cached(`sub:${cik}`, 60 * 60 * 1000, async () => {
    const sub = (await (await secFetch(`https://data.sec.gov/submissions/CIK${cik}.json`)).json()) as Submissions;
    const filings = annual(cik, sub.filings.recent);
    const anchor = filings[0] ? Date.parse(filings[0].filedAt) : Date.now();
    const from = new Date(anchor - 460 * DAY_MS).toISOString().slice(0, 10);
    const to = new Date(anchor - 270 * DAY_MS).toISOString().slice(0, 10);
    const pages = (sub.filings.files ?? []).filter((f) => f.filingTo >= from && f.filingFrom <= to).slice(0, 6);
    for (const file of pages) {
      if (filings.length >= 2) break;
      const cols = (await (await secFetch(`https://data.sec.gov/submissions/${file.name}`)).json()) as FilingColumns;
      filings.push(...annual(cik, cols));
    }
    filings.sort((a, b) => b.filedAt.localeCompare(a.filedAt));
    return { name: sub.name, filings };
  });
}

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', mdash: "—", ndash: "–", bull: "•", hellip: "…" };

// Filing HTML -> plain text with one line per block element. Drops the hidden inline-XBRL header.
export function htmlToText(html: string): string {
  return html
    .replace(/<ix:header[\s\S]*?<\/ix:header>/gi, " ")
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[  -​]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// Headings sit on their own line ("ITEM 1A. RISK FACTORS", "Item 1B. Unresolved Staff Comments."); cross-references
// inside sentences ("see Item 1A. Risk Factors in Part I") don't, so both patterns match whole lines only.
const START = /^item\s*1a\b[\s.:\-–—]*(?:["“]?risk factors["”]?\.?)?$/gim;
const END = /^item\s*(?:1b|1c|2)\b.{0,60}$/gim;

// "Item 1A. Risk Factors" through the next item heading. The table of contents also lists Item 1A, so the longest
// span that has a closing heading wins.
export function extractRiskFactors(text: string): string | null {
  let best: string | null = null;
  for (const m of text.matchAll(START)) {
    END.lastIndex = m.index + m[0].length;
    const end = END.exec(text);
    if (!end) continue;
    const body = text.slice(m.index + m[0].length, end.index).trim();
    if (!best || body.length > best.length) best = body;
  }
  return best && best.length > 2000 ? best : null;
}

// Risk Factors text for a filing; the full document is dropped right after extraction.
export function getRiskFactors(filing: Filing): Promise<string | null> {
  return cached(`rf:${filing.accession}`, DAY_MS, async () => extractRiskFactors(htmlToText(await (await secFetch(filing.url)).text())));
}
