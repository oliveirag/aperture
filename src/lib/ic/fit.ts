// Pure: how a hypothetical position changes the portfolio, from the same look-through math as the X-Ray.
import type { FitRow } from "@/data/ic-room";
import { formatPct } from "@/lib/format";
import { sectorFromIndustry } from "@/lib/sectors";
import { cleanName, type ApertureInput } from "@/lib/xray/compute";
import type { XrayModel } from "@/lib/xray/types";

export const FIT_NOTE = "Computed from your X-Ray, with and without the position";

const valueOf = (p: ApertureInput) => p.shares * p.price;

// Look-through dollars in one company: held directly plus its weight inside every ETF.
export function exposureValue(inputs: ApertureInput[], ticker: string) {
  let total = 0;
  for (const p of inputs) {
    if (!(p.shares > 0 && p.price > 0)) continue;
    if (p.kind === "etf" && p.etf) total += valueOf(p) * (p.etf.holdings.find((h) => h.ticker === ticker)?.weight ?? 0);
    else if (p.ticker === ticker) total += valueOf(p);
  }
  return total;
}

// The paths an exposure reaches you through, for the composer note ("0.4% through VOO and QQQ").
export function exposureNote(inputs: ApertureInput[], ticker: string, total: number) {
  const value = exposureValue(inputs, ticker);
  if (value <= 0 || total <= 0) return "Not in your portfolio today";
  const paths = inputs
    .filter((p) => p.shares > 0 && p.price > 0)
    .filter((p) => (p.kind === "etf" ? p.etf?.holdings.some((h) => h.ticker === ticker) : p.ticker === ticker))
    .map((p) => (p.kind === "etf" ? p.ticker : "direct"));
  const direct = paths.includes("direct");
  const funds = paths.filter((x) => x !== "direct");
  const via = [direct ? "held directly" : "", funds.length ? `through ${funds.join(" and ")}` : ""].filter(Boolean).join(" and ");
  return `${formatPct(value / total)} of your money today, ${via}`;
}

// Adds `amount` dollars of `candidate` (an already-classified position) to the portfolio.
export function withPosition(inputs: ApertureInput[], candidate: ApertureInput): ApertureInput[] {
  const held = inputs.find((p) => p.ticker === candidate.ticker);
  if (!held) return [...inputs, candidate];
  const price = held.price > 0 ? held.price : candidate.price;
  const shares = held.shares + (candidate.shares * candidate.price) / price;
  return inputs.map((p) => (p === held ? { ...held, price, shares } : p));
}

const sectorWeight = (m: XrayModel, sector: string) => m.sectors.find((s) => s.sector === sector)?.weight ?? 0;

// Before and after rows: portfolio value, the candidate's look-through weight, your largest exposure, and the sectors involved.
export function computeFit(
  candidate: ApertureInput,
  before: { inputs: ApertureInput[]; model: XrayModel | null },
  after: { inputs: ApertureInput[]; model: XrayModel },
): FitRow[] {
  const beforeTotal = before.model?.total ?? 0;
  const afterTotal = after.model.total;
  const share = (inputs: ApertureInput[], ticker: string, total: number) => (total > 0 ? exposureValue(inputs, ticker) / total : 0);
  const rows: FitRow[] = [
    { label: "Portfolio value", kind: "usd", before: beforeTotal, after: afterTotal },
    {
      label: `${cleanName(candidate.name)} look-through`,
      kind: "weight",
      before: share(before.inputs, candidate.ticker, beforeTotal),
      after: share(after.inputs, candidate.ticker, afterTotal),
    },
  ];
  const top = before.model?.topTen[0];
  if (top && top.ticker !== candidate.ticker) {
    rows.push({
      label: `${top.name} look-through (your largest)`,
      kind: "weight",
      before: share(before.inputs, top.ticker, beforeTotal),
      after: share(after.inputs, top.ticker, afterTotal),
    });
  }
  const sector = candidate.kind === "stock" ? sectorFromIndustry(candidate.industry) : null;
  if (sector && sector !== "Other") {
    rows.push({
      label: `${sector} sector`,
      kind: "weight",
      before: before.model ? sectorWeight(before.model, sector) : 0,
      after: sectorWeight(after.model, sector),
    });
  }
  const largest = before.model?.sectors.find((s) => s.sector !== "Other");
  if (largest && largest.sector !== sector) {
    rows.push({ label: `${largest.sector} sector (your largest)`, kind: "weight", before: largest.weight, after: sectorWeight(after.model, largest.sector) });
  }
  return rows;
}
