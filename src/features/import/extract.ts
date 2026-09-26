import { HOLDINGS } from "@/data/portfolio";

export type ExtractedHolding = { ticker: string; name: string; shares: number; value: number; confidence: number };

// The scripted read takes exactly this long.
export const SCAN_MS = 2400;

// Per-holding match confidence, in HOLDINGS order.
const CONFIDENCE = [0.99, 0.99, 0.98, 0.98, 0.99, 0.97, 0.99];

// Below this a row would need review; every canon row clears it.
export const MATCH_THRESHOLD = 0.9;

// The only place holdings are produced. Scripted: any image (or the sample) reads as the canon portfolio.
// GUI-51 may swap the body for a live call; callers only rely on the shape and the delay.
export async function extractHoldings(
  input: { file?: File; sample?: boolean },
  { delayMs = SCAN_MS }: { delayMs?: number } = {},
): Promise<ExtractedHolding[]> {
  void input;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return HOLDINGS.map((h, i) => ({
    ticker: h.ticker,
    name: h.name,
    shares: h.shares,
    value: h.value,
    confidence: CONFIDENCE[i] ?? 0.99,
  }));
}
