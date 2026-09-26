// Local until GUI-39's @/lib/format lands; GUI-48 swaps it.
export function formatPct(fraction: number, digits = 1) {
  const abs = Math.abs(fraction * 100).toFixed(digits);
  return `${fraction < 0 ? "−" : ""}${abs}%`;
}
