import type { Provenance } from "@/lib/provenance";

// One valuation contract: an explicitly reviewed position value is not a share count.
export type ValuedPosition = { shares: number; price: number; marketValue?: number };
export function positionValue(position: ValuedPosition): number {
  if (position.marketValue === undefined && position.shares > 0 && position.price === 0) throw new Error("A position price is unavailable; review a dated valuation before analysis.");
  const value = position.marketValue ?? position.shares * position.price;
  if (!Number.isFinite(position.shares) || position.shares < 0 || !Number.isFinite(position.price) || position.price < 0 || !Number.isFinite(value) || value < 0) {
    throw new Error("Position valuation must be finite and nonnegative; unresolved values require review.");
  }
  return value;
}
export function portfolioValue(positions: readonly ValuedPosition[]): number {
  const total = positions.reduce((sum, position) => sum + positionValue(position), 0);
  if (!Number.isFinite(total)) throw new Error("Portfolio valuation exceeds the supported numeric range.");
  return total;
}
export function repricePositions<T extends ValuedPosition & { ticker: string; kind?: string }>(positions: readonly T[], prices: ReadonlyMap<string, number>): T[] {
  return positions.map(position => {
    const price = prices.get(position.ticker);
    // Cash, unsupported and value-only rows retain their reviewed value. Never infer quantities.
    if (position.kind === "cash" || position.kind === "opaque" || position.marketValue !== undefined || price === undefined) return { ...position };
    const next = { ...position, price };
    positionValue(next);
    return next;
  });
}
export function valuationEvidence(inputs: readonly Provenance[]): Provenance {
  if (!inputs.length) throw new Error("Portfolio valuation requires input provenance.");
  return { kind: "computed", formula: "sum(reviewed position value, otherwise unchanged quantity × sourced unit price)", inputs };
}
