import type { XrayModel } from "@/lib/xray/types";
import type { ApertureInput } from "@/lib/xray/compute";
import type { Provenance } from "@/lib/provenance";
import { positionValue } from "@/lib/xray/valuation";

export const MAX_IMPORT_ROWS = 2000;
export type ImportRow = {
  ticker: string; name: string; shares: number | null; marketValue: number | null;
  kind: "stock" | "etf" | "cash" | "unknown" | "unsupported";
  valuationDate: string; excluded?: boolean; exclusionReason?: string;
  currency?: string; rowType?: "position" | "cash" | "total" | "unresolved";
  sourceLine?: number; rawText?: string;
  reviewState?: "required" | "confirmed";
  ocrConfidence?: number; reviewWarnings?: string[];
};
export type PositionResult = {
  state: "pending" | "ready" | "needs_input" | "blocked";
  attempts: number; retryAt?: string; error?: string;
  warnings?: string[];
  input?: ApertureInput;
  valuation?: { price: number; source: string; asOf: string; retrievedAt: string; provenance?: Provenance };
};
export type ImportJob = {
  id: string; owner_id: string; portfolio_id: string | null;
  status: "review" | "processing" | "needs_input" | "complete" | "cancelled";
  original: ImportRow[]; rows: ImportRow[]; results: PositionResult[];
  original_csv: string; original_hash: string; reviewed_csv: string | null; reviewed_hash: string | null; holdings_hash: string | null;
  revision: number; confirmed_at: string | null; created_at: string;
  snapshot_id: string | null; retry_at: string; source: string;
};
export type Snapshot = { id: string; portfolio_id: string; created_at: string; model: XrayModel; rows: ImportRow[]; results: PositionResult[] };

export function validValuationDate(date: string): boolean {
  const time = Date.parse(date);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date && time <= Date.now();
}

export function rowProblem(row: ImportRow): string | null {
  if (row.excluded) return row.exclusionReason?.trim() ? null : "Explain why this row is excluded.";
  if (row.rowType === "total") return "Summary total: exclude with a reason to avoid counting holdings twice.";
  if ((row.currency ?? (row.marketValue !== null ? "UNKNOWN" : "USD")) !== "USD") return "Confirm a USD valuation and currency; foreign amounts cannot be treated as dollars.";
  if (row.kind === "unknown") return "Confirm whether this is a stock, ETF, USD cash, or unsupported security.";
  if (row.kind === "unsupported") return row.name.trim() && (row.shares === null || (Number.isFinite(row.shares) && row.shares >= 0 && row.shares <= 1e15)) && Number.isFinite(row.marketValue) && row.marketValue! > 0 && validValuationDate(row.valuationDate) ? null : "Enter a security name, nonnegative quantity (or leave it empty), and a dated USD value; unsupported exposure stays in portfolio value.";
  if (row.kind === "cash") return (row.shares === null || (Number.isFinite(row.shares) && row.shares >= 0 && row.shares <= 1e15)) && Number.isFinite(row.marketValue) && row.marketValue! >= 0 && validValuationDate(row.valuationDate) ? null : "Enter the USD cash balance and its valuation date; any supplied quantity must be nonnegative.";
  if (!/^[A-Z][A-Z0-9.]{0,14}$/.test(row.ticker)) return "Confirm the security ticker.";
  if (!Number.isFinite(row.shares) || row.shares! <= 0 || row.shares! > 1e15) return "Enter a positive share quantity below 1 quadrillion.";
  if (row.marketValue !== null && (!Number.isFinite(row.marketValue) || row.marketValue <= 0)) return "Enter a positive market value or leave it empty.";
  if (row.marketValue !== null && !validValuationDate(row.valuationDate)) return "Confirm the date of the supplied valuation.";
  return null;
}

export function mergeInputs(results: PositionResult[]): ApertureInput[] {
  const merged=new Map<string,ApertureInput>();
  for(const result of results) {
    const input=result.input;if(!input)continue;
    const previous=merged.get(input.ticker);
    if(!previous){merged.set(input.ticker,{...input});continue;}
    if(previous.kind!==input.kind)throw new Error(`Conflicting instrument types for ${input.ticker}.`);
    const shares=previous.shares+input.shares;
    const value=positionValue(previous)+positionValue(input);
    if(!Number.isFinite(value)||!Number.isFinite(shares))throw new Error("Portfolio quantities exceed the supported numeric range.");
    const formula = "sum(reviewed values for repeated security)";
    const priorEvidence = previous.provenance?.kind === "computed" && previous.provenance.formula === formula ? previous.provenance.inputs : previous.provenance ? [previous.provenance] : [];
    const provenance: Provenance | undefined = previous.provenance && input.provenance ? { kind:"computed",formula,inputs:[...priorEvidence,input.provenance] } : undefined;
    const valueOnly = previous.marketValue !== undefined || input.marketValue !== undefined || shares === 0;
    merged.set(input.ticker,{...input,shares,price:valueOnly?0:value/shares,marketValue:valueOnly?value:undefined,provenance});
  }
  return [...merged.values()];
}

export function readRows(value: unknown): ImportRow[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_IMPORT_ROWS) throw new Error(`Submit 1–${MAX_IMPORT_ROWS} rows. No rows were truncated.`);
  return value.map((raw) => {
    const r = raw && typeof raw === "object" ? raw : {};
    return {
      ticker: typeof r.ticker === "string" ? r.ticker.trim().toUpperCase().replace(/^\$/, "").replace(/[/-]/g, ".").slice(0, 80) : "",
      name: typeof r.name === "string" ? r.name.slice(0, 200) : "",
      shares: typeof r.shares === "number" && Number.isFinite(r.shares) ? r.shares : null,
      marketValue: typeof r.marketValue === "number" && Number.isFinite(r.marketValue) ? r.marketValue : null,
      kind: ["stock", "etf", "cash", "unsupported"].includes(r.kind) ? r.kind : "unknown",
      // Quantity-only typed entries use USD quote pricing. An imported amount
      // without a currency marker (including OCR) requires explicit review.
      currency: r.currency === undefined ? (r.marketValue != null ? "UNKNOWN" : "USD") : typeof r.currency === "string" ? r.currency.trim().toUpperCase().slice(0, 12) : "UNKNOWN",
      rowType: ["position", "cash", "total", "unresolved"].includes(r.rowType) ? r.rowType : undefined,
      sourceLine: Number.isSafeInteger(r.sourceLine) && r.sourceLine > 0 ? r.sourceLine : undefined,
      rawText: typeof r.rawText === "string" ? r.rawText.slice(0, 2000) : undefined,
      reviewState: "required",
      ocrConfidence: typeof r.ocrConfidence === "number" && Number.isFinite(r.ocrConfidence) && r.ocrConfidence >= 0 && r.ocrConfidence <= 100 ? r.ocrConfidence : undefined,
      reviewWarnings: Array.isArray(r.reviewWarnings) ? r.reviewWarnings.filter((v:unknown):v is string=>typeof v === "string").slice(0, 20).map((v:string)=>v.slice(0, 500)) : undefined,
      valuationDate: typeof r.valuationDate === "string" ? r.valuationDate : "",
      excluded: r.excluded === true,
      exclusionReason: typeof r.exclusionReason === "string" ? r.exclusionReason.slice(0, 500) : "",
    };
  });
}
