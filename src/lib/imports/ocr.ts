// Server-only: reads brokerage screenshots with local OCR (Tesseract) when Gemini can't. The text is parsed into
// rows by layout rules: a ticker, then a share count and a dollar value on the same line or the one below it.
// Tickers must be known to SEC EDGAR or the ETF seed, so OCR noise and column headers don't become positions.
// The user still reviews every row before X-Ray, exactly as with Gemini.
import os from "node:os";
import path from "node:path";
import { isSeededEtf } from "@/lib/etf";
import type { RawHolding } from "@/lib/price-holdings";
import { companyFor } from "@/lib/sec";

type OcrWorker = { recognize: (image: Buffer) => Promise<{ data: { text: string; confidence?: number } }>; terminate: () => Promise<unknown> };

let worker: Promise<OcrWorker> | null = null;

// One worker for the server's lifetime. The English model (~5MB) is fetched once and cached outside the repo.
function ocrWorker() {
  worker ??= import("tesseract.js")
    .then(({ createWorker }) => createWorker("eng", 1, { cachePath: path.join(os.tmpdir(), "aperture-ocr") }) as Promise<OcrWorker>)
    .catch((err) => {
      worker = null;
      throw err;
    });
  return worker;
}

export async function ocrText(image: Buffer) {
  const w = await ocrWorker();
  return (await w.recognize(image)).data.text;
}

// Header and furniture words that look like tickers.
const NOT_TICKERS = new Set([
  "USD", "ETF", "CASH", "TOTAL", "TOTALS", "AM", "PM", "EST", "ET", "NA", "N", "A", "I", "US", "QTY", "PRICE", "VALUE", "SHARES",
  "SYMBOL", "SYMBOLS", "NAME", "COST", "GAIN", "LOSS", "DAY", "TODAY", "ALL", "BUY", "SELL", "TRADE", "IRA", "ROTH", "LLC", "INC", "CO", "CORP",
]);

const MONEY = /\(?[-−]?\$\s?[-−]?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\)?/g;
const SHARES = /([-−]?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?))\s*(?:shares?|shs?\b|sh\b|units?)/i;
// A line that starts with a ticker, optionally after OCR junk ("vVOO", "• AAPL").
const LEAD = /^[^A-Z]{0,3}([A-Z]{1,5}(?:\.[A-Z])?)\b(.*)$/;

const num = (s: string) => Number(s.replace(/,/g, "").replace(/−/g, "-"));

export type Candidate = { ticker: string; shares: number | null; marketValue: number | null; name: string | null; reviewState: "required"; ocrConfidence?: number; reviewWarnings: string[]; rawText: string; rowType?: "cash" | "total" | "unresolved" | "position" };

// Every line that could start a position row, with the numbers found on it and the next line.
export function parseRows(text: string, confidence?: number): Candidate[] {
  const lines = text.split(/\n+/).map((l) => l.replace(/[|¦]/g, " ").trim()).filter(Boolean);
  const out: Candidate[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(LEAD);
    if (!m || (NOT_TICKERS.has(m[1]) && !["USD", "CASH", "TOTAL", "TOTALS"].includes(m[1]))) continue;
    const rest = m[2];
    const next = lines[i + 1] && !LEAD.test(lines[i + 1]) ? lines[i + 1] : "";
    const both = `${rest} ${next}`;
    const dollars = [...both.matchAll(MONEY)].map((x) => (/[-−(]/.test(x[0]) ? -1 : 1) * num(x[1]));
    const sharesMatch = both.match(SHARES);
    // The last bare number before the first dollar amount is the quantity column ("AAPL Apple Inc 50 $284.00 $14,200.00").
    const beforeMoney = rest.split(/[-−]?\$/)[0];
    const bare = [...beforeMoney.matchAll(/(?<![\w.,−-])([-−]?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?))(?![\d.,]*\s*%)(?![\w])/g)].pop();
    const shares = sharesMatch ? num(sharesMatch[1]) : bare ? num(bare[1]) : null;
    // A share price can exceed the value of a fractional holding. Do not select
    // max(price, value, cost basis, gain); ambiguous columns need human review.
    const marketValue = dollars.length === 1 ? dollars[0] : null;
    if (shares === null && dollars.length === 0) continue;
    const name = rest.replace(MONEY, "").replace(SHARES, "").replace(/[-+−]?\d[\d,.]*%?/g, "").replace(/\s+/g, " ").trim();
    out.push({ ticker: m[1], shares, marketValue, name: /[a-z]{3}/.test(name) ? name.slice(0, 80) : null,
      rowType: /^(USD|CASH)$/.test(m[1]) ? "cash" : /^TOTALS?$/.test(m[1]) ? "total" : "position",
      reviewState: "required", rawText: lines[i],
      ocrConfidence: Number.isFinite(confidence) && confidence! >= 0 && confidence! <= 100 ? confidence : undefined,
      reviewWarnings: ["OCR extraction requires comparison with the source image.", ...(dollars.length > 1 ? ["Ambiguous monetary columns; enter the position value."] : [])] });
  }
  return out;
}

async function known(ticker: string) {
  if (isSeededEtf(ticker)) return true;
  return (await companyFor(ticker).catch(() => null)) !== null;
}

// OCR sometimes glues a stray letter to the front of a ticker ("VVOO"); try the ticker without it.
async function resolve(ticker: string) {
  if (await known(ticker)) return ticker;
  if (ticker.length > 2 && (await known(ticker.slice(1)))) return ticker.slice(1);
  return null;
}

export async function ocrHoldings(images: Buffer[]): Promise<(RawHolding & Candidate)[]> {
  const rows: (RawHolding & Candidate)[] = [];
  for (const image of images) {
    const { data } = await (await ocrWorker()).recognize(image);
    for (const c of parseRows(data.text, data.confidence)) {
      // Retain unknown symbols and cash. A suggested repair must be reviewed,
      // not silently replace an OCR ticker with a different real security.
      const suggestion = c.rowType === "position" ? await resolve(c.ticker) : null;
      rows.push({ ...c, reviewWarnings: [...c.reviewWarnings, ...(suggestion && suggestion !== c.ticker ? [`Possible ticker: ${suggestion}; confirm against the image.`] : [])] });
    }
  }
  return rows;
}
