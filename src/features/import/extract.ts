import type { SnapHolding, SnapResponse } from "@/app/api/snap/route";
import { HOLDINGS } from "@/data/portfolio";
import type { MarketResponse } from "@/lib/finnhub";

// `source` is "live" when Gemini read the image; the sample leaves it unset.
// `status` mirrors /api/snap: only "matched" and "unpriced" rows count toward the total.
export type ExtractedHolding = {
  ticker: string;
  name: string;
  industry: string | null;
  shares: number;
  price: number | null;
  value: number;
  status: SnapHolding["status"];
  source?: "live";
};

export type ExtractResult = { ok: true; holdings: ExtractedHolding[]; model?: string } | { ok: false; error: string };

// The sample read takes exactly this long; a real read lasts at least this long.
export const SCAN_MS = 2400;

// Gemini retries across models server-side; give up a little after the server would.
const LIVE_TIMEOUT_MS = 55000;

export const counts = (h: ExtractedHolding) => h.status !== "unknown";

// The sample screenshot is the demo portfolio. Its values use live Finnhub prices when they're available.
async function readSample(): Promise<ExtractResult> {
  let quotes: MarketResponse["quotes"] = {};
  try {
    const res = await fetch(`/api/market?symbols=${HOLDINGS.map((h) => h.ticker).join(",")}&fields=quote`);
    if (res.ok) quotes = ((await res.json()) as MarketResponse).quotes;
  } catch {}
  return {
    ok: true,
    holdings: HOLDINGS.map((h) => {
      const price = quotes[h.ticker]?.price ?? h.price;
      return { ticker: h.ticker, name: h.name, industry: h.category, shares: h.shares, price, value: h.shares * price, status: "matched" };
    }),
  };
}

// Posts the image to /api/snap: Gemini reads it, Finnhub prices it.
async function readLive(file: File): Promise<ExtractResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
  try {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/snap", { method: "POST", body, signal: controller.signal });
    const data = (await res.json().catch(() => ({}))) as Partial<SnapResponse> & { error?: string };
    if (!res.ok || !Array.isArray(data.holdings)) {
      return { ok: false, error: data.error ?? "Couldn't read the screenshot. Try again in a moment." };
    }
    return { ok: true, model: data.model, holdings: data.holdings.map((h) => ({ ...h, source: "live" as const })) };
  } catch {
    return {
      ok: false,
      error: controller.signal.aborted ? "Reading the screenshot took too long. Try again in a moment." : "Couldn't reach the server.",
    };
  } finally {
    clearTimeout(timer);
  }
}

// The only place holdings are produced. A dropped file always goes to Gemini; the sample button replays the demo portfolio.
// Either way the scan lasts at least delayMs so the animation can finish.
export async function extractHoldings(
  input: { file?: File; sample?: boolean },
  { delayMs = SCAN_MS }: { delayMs?: number } = {},
): Promise<ExtractResult> {
  const wait = new Promise((resolve) => setTimeout(resolve, delayMs));
  const [result] = await Promise.all([input.file ? readLive(input.file) : readSample(), wait]);
  return result;
}
