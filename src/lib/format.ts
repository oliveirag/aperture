const MINUS = "−";

// Round half away from zero. The tiny nudge absorbs float error (0.225 * 30 is 6.749999…, not 6.75).
function roundAbs(n: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(Math.abs(n) * f + 1e-7) / f;
}

// 148420 -> "$148,420"; -6027.5 -> "−$6,028"
export function formatUSD(n: number, digits = 0) {
  const abs = roundAbs(n, digits);
  const body = abs.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${n < 0 && abs !== 0 ? MINUS : ""}$${body}`;
}

// "+$612", "−$6,028", "$0"
export function formatSignedUSD(n: number, digits = 0) {
  const abs = roundAbs(n, digits);
  if (abs === 0) return formatUSD(0, digits);
  return n > 0 ? `+${formatUSD(n, digits)}` : formatUSD(n, digits);
}

// 0.175923 -> "17.6%"; -0.0406 -> "−4.1%"
export function formatPct(fraction: number, digits = 1) {
  const abs = roundAbs(fraction * 100, digits);
  return `${fraction < 0 && abs !== 0 ? MINUS : ""}${abs.toFixed(digits)}%`;
}

// "+0.4%", "−4.1%"
export function formatSignedPct(fraction: number, digits = 1) {
  const abs = roundAbs(fraction * 100, digits);
  if (abs === 0) return formatPct(0, digits);
  return fraction > 0 ? `+${formatPct(fraction, digits)}` : formatPct(fraction, digits);
}

// Shock impacts scale linearly with severity.
export function scaleShock(base: number, severity: number, baseSeverity: number) {
  return (base * severity) / baseSeverity;
}
