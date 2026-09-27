// SSGA's public full daily holdings workbooks. Uses the already-pinned SheetJS
// parser; binary fixtures store exact response bytes losslessly as base64.
import * as XLSX from "xlsx";
import { assertProvenance, type Provenance, type RetrievedProvenance } from "../provenance";
import { normalizeSymbol, validSymbol, type ReconciledFund, type Unmatched } from "./index";

export function parseIssuer(ticker: "SPY" | "DIA", base64: string, inputSource: RetrievedProvenance) {
  assertProvenance(inputSource);
  const expected = `https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-${ticker.toLowerCase()}.xlsx`;
  if (inputSource.provider !== "issuer-file" || inputSource.endpoint !== expected) throw new Error("Untrusted issuer source/ticker");
  if (base64.length > 6 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error("Invalid base64 workbook");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.subarray(0, 2).toString() !== "PK") throw new Error("Invalid XLSX workbook");
  const workbook = XLSX.read(bytes, { type: "buffer", cellFormula: false, cellHTML: false, sheetRows: 10000 });
  const sheet = workbook.Sheets.holdings;
  if (!sheet) throw new Error("Issuer workbook missing holdings sheet");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
  if (rows.find(row => row[0] === "Ticker Symbol:")?.[1] !== ticker) throw new Error("Issuer fund ticker mismatch");
  const stamp = rows.find(row => row[0] === "Holdings:")?.[1];
  const date = typeof stamp === "string" && /^As of (\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(stamp);
  const month = date && ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(date[2]);
  if (!date || typeof month !== "number" || month < 0) throw new Error("Issuer holdings date missing");
  const asOf = `${date[3]}-${String(month + 1).padStart(2, "0")}-${date[1]}`;
  if (!Number.isFinite(Date.parse(asOf)) || new Date(asOf).toISOString().slice(0, 10) !== asOf) throw new Error("Invalid issuer holdings date");
  const headerIndex = rows.findIndex(row => row.includes("Name") && row.includes("Ticker") && row.includes("Weight"));
  if (headerIndex < 0) throw new Error("Issuer holdings columns missing");
  const header = rows[headerIndex];
  const columns = ["Name", "Ticker", "Identifier", "Weight", "Local Currency"].map(name => header.indexOf(name));
  if (columns.some(i => i < 0)) throw new Error("Issuer holdings columns missing");
  const holdings = new Map<string, { ticker: string; name: string; weight: number; identifiers: { id: string; method: string }[] }>();
  const unmatched: Unmatched[] = [];
  let positionCount = 0;
  let mappedPositions = 0;
  let reportedWeight = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    const [nameRaw, tickerRaw, idRaw, percent, currencyRaw] = columns.map(i => row[i]);
    // Footer text has neither identifier nor ticker nor weight. Do not silently drop malformed security rows.
    if ([tickerRaw, idRaw, percent, currencyRaw].every(v => v === "" || v === undefined)) continue;
    if (typeof nameRaw !== "string" || !nameRaw.trim() || typeof percent !== "number" || !Number.isFinite(percent)) throw new Error("Invalid issuer holding weight/name");
    const name = nameRaw.trim();
    const symbol = normalizeSymbol(String(tickerRaw));
    const cusip = String(idRaw);
    const currency = String(currencyRaw);
    const weight = percent / 100;
    positionCount++; reportedWeight += weight;
    if (validSymbol(symbol) && /^[A-Z][A-Z.]{0,5}$/.test(symbol) && currency === "USD" && weight > 0 && !/^(?:CASH|US DOLLAR)$/i.test(name)) {
      const previous = holdings.get(symbol);
      holdings.set(symbol, { ticker: symbol, name: previous?.name ?? name, weight: (previous?.weight ?? 0) + weight, identifiers: [...(previous?.identifiers ?? []), { id: `${/^[A-Z0-9*@#]{9}$/.test(cusip) ? "CUSIP" : "ISSUER"}:${cusip}`, method: "issuer-ticker" }] });
      mappedPositions++;
    } else unmatched.push({ name, title: name, ticker: symbol, cusip, currency, country: "", payoff: weight < 0 ? "Short" : "Long", assetCategory: name === "US DOLLAR" ? "cash" : "unmapped", weight, reason: "Issuer cash/non-equity or unsupported ticker/currency; not discarded" });
  }
  if (positionCount < (ticker === "SPY" ? 500 : 30)) throw new Error("Issuer file is truncated or top holdings only");
  const unreportedWeight = 1 - reportedWeight;
  const reconciled = Math.abs(unreportedWeight) <= 0.005;
  unmatched.push({ name: "Unreported / rounding remainder", title: "Issuer-file remainder", currency: "", country: "", payoff: "", assetCategory: "unreported", weight: unreportedWeight, reason: "1 minus all issuer-reported weights; not assumed cash or mapped equities" });
  const mappedWeight = [...holdings.values()].reduce((sum, p) => sum + p.weight, 0);
  const unmatchedWeight = unmatched.reduce((sum, p) => sum + p.weight, 0);
  const coverage: ReconciledFund["coverage"] = { mappedWeight, unmatchedWeight, accountedWeight: mappedWeight + unmatchedWeight, reportedWeight, unreportedWeight, reconciliationError: reportedWeight - 1, positionCount, mappedPositions, fullHoldings: reconciled, reconciled };
  const holdingsSource = { ...inputSource, asOf };
  const result = { ticker, asOf, source: "seed" as const, provider: "issuer-file" as const, holdings: [...holdings.values()].sort((a, b) => b.weight - a.weight), unmatched, sectors: [], coverage, warnings: ["Issuer daily holdings, not an SEC N-PORT filing; sector classification unavailable", ...(!reconciled ? ["Issuer weights do not reconcile within 0.5 percentage points"] : [])] };
  const weights: Provenance = { kind: "computed", formula: "Issuer Weight percent / 100; duplicate tickers summed without normalization", inputs: [holdingsSource] };
  const remainder: Provenance = { kind: "computed", formula: "1 - sum(all issuer weights / 100); unreported exposure, not inferred cash", inputs: [holdingsSource] };
  const provenance: Record<string, Provenance> = {};
  result.holdings.forEach((_, i) => { provenance[`/holdings/${i}/weight`] = weights; });
  unmatched.forEach((p, i) => { provenance[`/unmatched/${i}/weight`] = p.assetCategory === "unreported" ? remainder : weights; });
  for (const key of Object.keys(coverage)) if (typeof coverage[key as keyof typeof coverage] === "number") provenance[`/coverage/${key}`] = { kind: "computed", formula: "Count mapped/disclosed rows; sum original fractional weights; reconciliationError = reportedWeight - 1 before residual", inputs: [weights, remainder] };
  return { ...result, provenance, holdingsSource };
}
