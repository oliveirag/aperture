import { formatPct, formatSignedUSD, formatUSD } from "@/lib/format";

export { formatPct, formatSignedUSD, formatUSD };

const MINUS = "−";

// Percentage-point change, e.g. 0.063 → "+6.3 pts".
export function formatPts(delta: number, digits = 1) {
  const abs = Math.abs(delta * 100).toFixed(digits);
  if (Number(abs) === 0) return "0.0 pts";
  return `${delta < 0 ? MINUS : "+"}${abs} pts`;
}
