import type { PerformancePoint } from "../types/demo";

const START = 121300;
const END = 148420;
const WEEKS = 52;
const FIRST_FRIDAY = Date.UTC(2025, 8, 26); // 2025-09-26
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// 53 weekly closes, 2025-09-26 through 2026-09-25. The wiggle is zero at both ends, so the endpoints are exact.
export const PERFORMANCE: PerformancePoint[] = Array.from({ length: WEEKS + 1 }, (_, i) => ({
  date: new Date(FIRST_FRIDAY + i * WEEK_MS).toISOString().slice(0, 10),
  value: Math.round(
    START *
      (END / START) ** (i / WEEKS) *
      (1 + Math.sin((Math.PI * i) / WEEKS) * (0.035 * Math.sin(i / 2.3) + 0.015 * Math.sin(i / 1.1))),
  ),
}));

// Return over the last 4 (1M), 26 (6M) or 52 (1Y) weeks.
export function returnOver(weeks: 4 | 26 | 52) {
  return PERFORMANCE[WEEKS].value / PERFORMANCE[WEEKS - weeks].value - 1;
}
