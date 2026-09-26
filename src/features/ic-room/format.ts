// Local until GUI-39's @/lib/format lands; GUI-48 swaps it.
const MINUS = "−";

export function formatUSD(n: number) {
  const abs = Math.round(Math.abs(n)).toLocaleString("en-US");
  return `${n < 0 ? MINUS : ""}$${abs}`;
}

export function formatPct(fraction: number, digits = 1) {
  const abs = Math.abs(fraction * 100).toFixed(digits);
  return `${fraction < 0 ? MINUS : ""}${abs}%`;
}

// Percentage-point change, e.g. 0.063 → "+6.3 pts".
export function formatPts(delta: number, digits = 1) {
  const abs = Math.abs(delta * 100).toFixed(digits);
  if (Number(abs) === 0) return "0.0 pts";
  return `${delta < 0 ? MINUS : "+"}${abs} pts`;
}

export function formatSignedUSD(n: number) {
  if (Math.round(n) === 0) return "$0";
  return `${n < 0 ? MINUS : "+"}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
}
