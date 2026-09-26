import type { XrayModel } from "@/lib/xray/types";
import type { LookthroughInput } from "@/lib/xray/compute";

export const MAX_IMPORT_ROWS = 2000;
export type ImportRow = {
  ticker: string; name: string; shares: number | null; marketValue: number | null;
  kind: "stock" | "etf" | "cash" | "unknown";
  valuationDate: string; excluded?: boolean; exclusionReason?: string;
};
export type PositionResult = {
  state: "pending" | "ready" | "needs_input" | "blocked";
  attempts: number; retryAt?: string; error?: string;
  warnings?: string[];
  input?: LookthroughInput;
  valuation?: { price: number; source: string; asOf: string; retrievedAt: string };
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

export function rowProblem(row: ImportRow): string | null {
  if (row.excluded) return row.exclusionReason?.trim() ? null : "Explain why this row is excluded.";
  if (row.kind === "unknown") return "Confirm whether this is a stock, ETF, or USD cash.";
  if (row.kind === "cash") return Number.isFinite(row.marketValue) && row.marketValue! > 0 && /^\d{4}-\d{2}-\d{2}$/.test(row.valuationDate) && Number.isFinite(Date.parse(row.valuationDate)) && Date.parse(row.valuationDate)<=Date.now() ? null : "Enter the USD cash balance and its valuation date.";
  if (!/^[A-Z][A-Z0-9.]{0,14}$/.test(row.ticker)) return "Confirm the security ticker.";
  if (!Number.isFinite(row.shares) || row.shares! <= 0 || row.shares! > 1e15) return "Enter a positive share quantity below 1 quadrillion.";
  if (row.marketValue !== null && (!Number.isFinite(row.marketValue) || row.marketValue <= 0)) return "Enter a positive market value or leave it empty.";
  if (row.marketValue !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(row.valuationDate) || !Number.isFinite(Date.parse(row.valuationDate)) || Date.parse(row.valuationDate) > Date.now())) return "Confirm the date of the supplied valuation.";
  return null;
}

export function mergeInputs(results: PositionResult[]): LookthroughInput[] {
  const merged=new Map<string,LookthroughInput>();
  for(const result of results) {
    const input=result.input;if(!input)continue;
    const previous=merged.get(input.ticker);
    if(!previous){merged.set(input.ticker,{...input});continue;}
    if(previous.kind!==input.kind)throw new Error(`Conflicting instrument types for ${input.ticker}.`);
    const shares=previous.shares+input.shares;
    const value=previous.shares*previous.price+input.shares*input.price;
    if(!Number.isFinite(value)||!Number.isFinite(shares))throw new Error("Portfolio quantities exceed the supported numeric range.");
    merged.set(input.ticker,{...input,shares,price:value/shares});
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
      kind: ["stock", "etf", "cash"].includes(r.kind) ? r.kind : "unknown",
      valuationDate: typeof r.valuationDate === "string" ? r.valuationDate : "",
      excluded: r.excluded === true,
      exclusionReason: typeof r.exclusionReason === "string" ? r.exclusionReason.slice(0, 500) : "",
    };
  });
}
