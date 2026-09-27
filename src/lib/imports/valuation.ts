import { assertProvenance, type Provenance } from "@/lib/provenance";
import type { ApertureInput } from "@/lib/xray/compute";
import { rowProblem, type ImportRow } from "./types";

// Call only after the enclosing import's explicit user confirmation, never from OCR.
export function reviewedSource(row: ImportRow, reviewedAt: string): Provenance {
  const provenance: Provenance = { kind: "retrieved", provider: "user-import", source: `User-reviewed brokerage input: ${row.name || row.ticker || "USD cash"}`, retrievedAt: reviewedAt, ...(row.valuationDate ? { asOf: row.valuationDate } : {}) };
  assertProvenance(provenance);
  return provenance;
}
export function reviewedValueInput(row: ImportRow, reviewedAt: string): ApertureInput {
  const problem = rowProblem(row);
  if (problem || row.excluded || row.marketValue === null) throw new Error(problem ?? "A reviewed market value is required.");
  const provenance = reviewedSource(row, reviewedAt);
  if (row.kind === "cash") return { ticker: "USD", name: "USD cash", kind: "cash", shares: row.marketValue, price: 1, provenance };
  if (row.kind === "unsupported") return { ticker: row.ticker || `UNSUPPORTED:${row.name}`, name: row.name, kind: "opaque", shares: row.shares ?? 0, price: 0, marketValue: row.marketValue, provenance };
  return { ticker: row.ticker, name: row.name || row.ticker, kind: row.kind as "stock" | "etf", shares: row.shares!, price: row.marketValue / row.shares!, provenance };
}
