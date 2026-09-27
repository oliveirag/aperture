// Reads a brokerage positions export (Fidelity, Schwab, Vanguard, or a plain ticker,shares file) into rows to price.
// Runs in the browser; the file never leaves the device, only ticker/shares/value go to /api/price.

export type ParsedRow = {
  ticker: string; shares: number | null; marketValue: number | null; name?: string;
  currency?: string; rowType?: "position" | "cash" | "total" | "unresolved";
  sourceLine?: number; reviewState?: "required"; rawText?: string;
};
export type SkippedRow = { line: number; text: string; reason: string };
export type CsvResult = { rows: ParsedRow[]; skipped: SkippedRow[]; error: string | null };

const TICKER_HEADERS = ["symbol", "ticker", "securitysymbol", "symbolcusip", "tickersymbol", "instrument"];
const SHARES_HEADERS = ["quantity", "shares", "qty", "units", "sharesquantity", "quantityshares"];
const NAME_HEADERS = ["description", "securitydescription", "investmentname", "name", "securityname"];
const VALUE_HEADERS = ["marketvalue", "currentvalue", "totalvalue", "value", "mktval", "marketvaluemktval", "positionvalue"];

const TICKER = /^[A-Z][A-Z.]{0,5}$/;
// Money-market sweep funds (SPAXX, VMFXX, SWVXX...) are cash, not holdings.
const MONEY_MARKET = /^[A-Z]{3}XX$/;
const CASH_TEXT = /cash|pending|total|money market|core position/i;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

// Splits CSV text into rows of cells, honoring quotes (including quoted commas, quotes and newlines).
function tokenize(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim()));
}

function detectDelimiter(text: string) {
  const sample = text.split(/\r?\n/).slice(0, 20).join("\n");
  const counts = [",", ";", "\t"].map((d) => [d, sample.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

// "$1,234.56" -> 1234.56, "(12.50)" -> -12.5, "--" / "n/a" / "" -> null.
export function parseNumber(s: string | undefined): number | null {
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s.trim());
  const cleaned = s.replace(/[$,\s()+]/g, "");
  if (!cleaned || !/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

function findColumn(header: string[], names: string[]) {
  const normalized = header.map(norm);
  for (const name of names) {
    const i = normalized.indexOf(name);
    if (i !== -1) return i;
  }
  return -1;
}

// Lossless review path: retain rows separately, including unrecognized securities and cash.
// The legacy parser below remains for the practice/demo flow.
export function parseReviewCsv(input: string): CsvResult {
  const table = tokenize(input.replace(/^\uFEFF/, ""), detectDelimiter(input));
  const isHeader = (r: string[]) => findColumn(r, TICKER_HEADERS) !== -1 && (findColumn(r, SHARES_HEADERS) !== -1 || findColumn(r, VALUE_HEADERS) !== -1);
  const headerAt = table.findIndex(isHeader);
  let header = headerAt >= 0 ? table[headerAt] : ["ticker", "shares"];
  const rows: ParsedRow[] = [];
  for (let i = headerAt + 1; i < table.length; i++) {
    const r = table[i];
    if (!r.some(Boolean)) continue;
    // IBKR statements have independently headed sections. Preserve other sections
    // as unresolved rather than interpreting transactions as current positions.
    if (isHeader(r)) { header = r; continue; }
    const ibkr = header[1] === "Header";
    const wrongSection = ibkr && (r[0] !== header[0] || r[1] !== "Data");
    const activity = findColumn(header, ["transcode", "activitydate", "transactiontype", "tradedate"]) >= 0 || (ibkr && !/^open positions$/i.test(header[0]));
    const ticker = wrongSection ? "" : (r[findColumn(header, TICKER_HEADERS)] ?? "").trim().toUpperCase().replace(/\*+$/, "").replace(/[/-]/g, ".");
    const name = r[findColumn(header, NAME_HEADERS)] ?? "";
    const label = `${ticker} ${name}`.trim();
    const summary = /^(?:account\s+|portfolio\s+|grand\s+)?totals?\b/i.test(label) || (ibkr && r.some(c => /^total(?: in .+)?$/i.test(c)));
    const cash = /^(?:USD|CASH|SPAXX|VMFXX|SWVXX|FDRXX|FCASH)$/.test(ticker) || /^(?:cash & cash investments|cash balance|settlement fund)$/i.test(ticker || name);
    const currencyIndex = findColumn(header, ["currency", "currencycode", "ccy"]);
    const valueText = r[findColumn(header, VALUE_HEADERS)] ?? "";
    // A bare amount (or ambiguous dollar sign) is not a currency declaration.
    // Review must explicitly confirm USD; this parser never performs FX conversion.
    const currency = currencyIndex >= 0 ? (r[currencyIndex] ?? "").toUpperCase() : /€/.test(valueText) ? "EUR" : /£/.test(valueText) ? "GBP" : "UNKNOWN";
    rows.push({ ticker, name, shares: wrongSection ? null : parseNumber(r[findColumn(header, SHARES_HEADERS)]),
      marketValue: wrongSection ? null : parseNumber(valueText.replace(/[€£¥]/g, "")), currency,
      rowType: summary ? "total" : activity ? "unresolved" : cash ? "cash" : !wrongSection && /^[A-Z][A-Z0-9.]{0,14}$/.test(ticker) ? "position" : "unresolved",
      sourceLine: i + 1, reviewState: "required", rawText: r.join(" | ").slice(0, 2000) });
  }
  return { rows, skipped: [], error: rows.length ? null : "No rows found in this CSV." };
}

export function parsePositionsCsv(input: string): CsvResult {
  const text = input.replace(/^﻿/, "");
  const table = tokenize(text, detectDelimiter(text));
  const skipped: SkippedRow[] = [];
  const merged = new Map<string, ParsedRow>();

  // The header is the first row naming a ticker column plus a shares or value column; brokers put account info above it.
  let headerAt = -1;
  let cols = { ticker: 0, shares: 1, value: -1, name: -1 };
  for (let i = 0; i < Math.min(table.length, 25); i++) {
    const ticker = findColumn(table[i], TICKER_HEADERS);
    const shares = findColumn(table[i], SHARES_HEADERS);
    const value = findColumn(table[i], VALUE_HEADERS);
    if (ticker !== -1 && (shares !== -1 || value !== -1)) {
      headerAt = i;
      cols = { ticker, shares, value, name: findColumn(table[i], NAME_HEADERS) };
      break;
    }
  }

  // No header: accept a bare "TICKER,SHARES" file if its first data row looks like one.
  if (headerAt === -1) {
    const first = table.find((r) => r.some((c) => c !== ""));
    const looksBare = first && TICKER.test((first[0] ?? "").toUpperCase()) && parseNumber(first[1]) !== null;
    if (!looksBare) {
      return { rows: [], skipped: [], error: "Couldn't find a Symbol/Ticker column with Quantity/Shares or Market Value." };
    }
  }

  for (let i = headerAt + 1; i < table.length; i++) {
    const cells = table[i];
    if (cells.every((c) => c === "")) continue;
    const line = i + 1;
    const text = cells.filter(Boolean).join(", ").slice(0, 80);
    const rawTicker = (cells[cols.ticker] ?? "").toUpperCase().replace(/\*+$/, "").trim();
    const shares = cols.shares === -1 ? null : parseNumber(cells[cols.shares]);
    const marketValue = cols.value === -1 ? null : parseNumber(cells[cols.value]);

    if (!rawTicker) {
      // Footer lines ("Account Total", disclaimers) have no symbol; only report ones that carry a value.
      if (marketValue !== null || shares !== null) skipped.push({ line, text, reason: "No ticker" });
      continue;
    }
    if (MONEY_MARKET.test(rawTicker) || CASH_TEXT.test(rawTicker)) {
      skipped.push({ line, text, reason: "Cash or money market" });
      continue;
    }
    if (/\s|\d/.test(rawTicker)) {
      skipped.push({ line, text, reason: "Option or bond (not supported)" });
      continue;
    }
    const ticker = rawTicker.replace(/[/-]/g, ".");
    if (!TICKER.test(ticker)) {
      skipped.push({ line, text, reason: "Not a ticker" });
      continue;
    }
    const s = shares !== null && shares > 0 ? shares : null;
    const v = marketValue !== null && marketValue > 0 ? marketValue : null;
    if (s === null && v === null) {
      skipped.push({ line, text, reason: "No share count or value" });
      continue;
    }
    // The same ticker in several accounts becomes one position.
    const prev = merged.get(ticker);
    const name = cols.name === -1 ? "" : (cells[cols.name] ?? "").trim();
    merged.set(ticker, {
      ticker,
      ...(prev?.name || name ? { name: prev?.name || name } : {}),
      shares: s === null ? (prev?.shares ?? null) : (prev?.shares ?? 0) + s,
      marketValue: v === null ? (prev?.marketValue ?? null) : (prev?.marketValue ?? 0) + v,
    });
  }

  const rows = [...merged.values()];
  return { rows, skipped, error: rows.length === 0 ? "No positions found in this file." : null };
}
