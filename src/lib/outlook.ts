// Pure: an empirical historical range for one stock, checked against its own past. This is not a price prediction.
// For each week, the range is the 10th/50th/90th percentile of that stock's own trailing 13-week returns. A walk-forward
// backtest then counts how often the real next 13 weeks landed inside the range, using only data available at the time.
import type { Weekly } from "@/lib/history";

export const HORIZON_WEEKS = 13;
const WINDOW_WEEKS = 260;
const MIN_WINDOW = 104;
export const NOMINAL_COVERAGE = 0.8;

export type Outlook = {
  ticker: string;
  asOf: string;
  price: number;
  horizonWeeks: number;
  sampleWeeks: number;
  // Simple returns over the horizon at the 10th, 50th and 90th percentile of history.
  low: number; median: number; high: number;
  backtest: { tests: number; insideShare: number; nominal: number };
  // Weekly closes for the last year, for drawing the range against recent history.
  recent: { date: string; close: number }[];
};

function quantile(sorted: number[], q: number) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Overlapping horizon log returns for every start week i with i + horizon <= end (exclusive index of the last known close + 1).
function windowReturns(closes: number[], end: number) {
  const out: number[] = [];
  for (let i = Math.max(0, end - WINDOW_WEEKS); i + HORIZON_WEEKS < end; i++) out.push(Math.log(closes[i + HORIZON_WEEKS] / closes[i]));
  return out.sort((a, b) => a - b);
}

export function buildOutlook(ticker: string, weekly: Weekly, price: number, today: string): Outlook | null {
  const closes = weekly.map(w => w.close);
  if (closes.length < MIN_WINDOW + HORIZON_WEEKS * 2 || !(price > 0)) return null;
  const now = windowReturns(closes, closes.length);
  if (now.length < MIN_WINDOW) return null;
  let tests = 0, inside = 0;
  // Step by the horizon so tests do not reuse the same outcome weeks.
  for (let t = MIN_WINDOW + HORIZON_WEEKS; t + HORIZON_WEEKS < closes.length; t += HORIZON_WEEKS) {
    const past = windowReturns(closes, t + 1);
    if (past.length < MIN_WINDOW) continue;
    const realized = Math.log(closes[t + HORIZON_WEEKS] / closes[t]);
    tests++;
    if (realized >= quantile(past, 0.1) && realized <= quantile(past, 0.9)) inside++;
  }
  if (tests < 8) return null;
  const simple = (q: number) => Math.exp(quantile(now, q)) - 1;
  return {
    ticker, asOf: today, price, horizonWeeks: HORIZON_WEEKS, sampleWeeks: now.length,
    low: simple(0.1), median: simple(0.5), high: simple(0.9),
    backtest: { tests, insideShare: inside / tests, nominal: NOMINAL_COVERAGE },
    recent: weekly.slice(-52),
  };
}
