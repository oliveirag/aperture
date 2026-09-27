import { createHash } from "node:crypto";
import type { ImportRow } from "./types";

const cell = (v: unknown) => {
  const text = String(v ?? "");
  const safe = typeof v === "string" && /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};
export const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
export function auditCsv(rows: ImportRow[]) {
  return "ticker,name,kind,shares,market_value,valuation_date,excluded,reason,currency,row_type,source_line,ocr_confidence,review_state\n" + rows.map(r =>
    [r.ticker, r.name, r.kind, r.shares, r.marketValue, r.valuationDate, r.excluded === true, r.exclusionReason, r.currency ?? "USD", r.rowType, r.sourceLine, r.ocrConfidence, r.reviewState].map(cell).join(",")
  ).join("\n") + "\n";
}

export function extractionCsv(rows: unknown[]) {
  return "ticker,name,kind,shares,market_value,valuation_date,currency,row_type,source_line,ocr_confidence,review_warnings,raw_text\n" + rows.map(value=>{
    const r=value && typeof value==="object" ? value as Record<string,unknown> : {};
    return [r.ticker,r.name,r.kind,r.shares,r.marketValue,r.valuationDate,r.currency,r.rowType,r.sourceLine,r.ocrConfidence,JSON.stringify(r.reviewWarnings??[]),r.rawText].map(cell).join(",");
  }).join("\n")+"\n";
}

// Quotes, dates and descriptions are deliberately absent from portfolio identity.
// Integer decimal accumulation avoids order-dependent floating-point sums.
function units(n: number): bigint {
  const [coefficient, exp = "0"] = n.toString().toLowerCase().split("e");
  const [whole, fraction = ""] = coefficient.split(".");
  const power = 18 + Number(exp) - fraction.length;
  if (power < 0) throw new Error("Share precision exceeds 18 decimal places.");
  return BigInt(whole + fraction) * BigInt(10) ** BigInt(power);
}
export function identityCsv(rows: ImportRow[]) {
  const merged = new Map<string, bigint>();
  for (const r of rows.filter(r => !r.excluded)) {
    const valueOnly = r.kind === "cash" || (r.kind === "unsupported" && r.shares === null);
    const security = r.kind === "cash" ? "USD" : r.ticker || r.name;
    const key = `${r.kind}${valueOnly && r.kind !== "cash" ? ":value" : ""},${cell(security)},${r.currency ?? "USD"}`;
    merged.set(key, (merged.get(key) ?? BigInt(0)) + units(valueOnly ? r.marketValue! : r.shares!));
  }
  return "identity-v2\nkind,security,currency,units_1e18\n" + [...merged].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => `${k},${v}`).join("\n") + "\n";
}
