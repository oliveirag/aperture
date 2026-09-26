import { HOLDINGS } from "@/data/portfolio";

// `source` is "live" only when Gemini read the image; canned rows leave it unset.
export type ExtractedHolding = { ticker: string; name: string; shares: number; value: number; confidence: number; source?: "live" };

// The scripted read takes exactly this long.
export const SCAN_MS = 2400;

// Per-holding match confidence, in HOLDINGS order.
const CONFIDENCE = [0.99, 0.99, 0.98, 0.98, 0.99, 0.97, 0.99];

// Below this a row would need review; every canon row clears it.
export const MATCH_THRESHOLD = 0.9;

// The live read gives up after this and falls back to the canned rows.
const LIVE_TIMEOUT_MS = 8000;

function canned(): ExtractedHolding[] {
  return HOLDINGS.map((h, i) => ({
    ticker: h.ticker,
    name: h.name,
    shares: h.shares,
    value: h.value,
    confidence: CONFIDENCE[i] ?? 0.99,
  }));
}

// Posts the image to /api/snap. Resolves to canon-shaped rows, or a reason string on any failure.
async function readLive(file: File): Promise<ExtractedHolding[] | string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
  try {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/snap", { method: "POST", body, signal: controller.signal });
    if (!res.ok) return `http ${res.status}`;
    const data: unknown = await res.json();
    const raw = (data as { holdings?: unknown })?.holdings;
    if (!Array.isArray(raw)) return "bad response";

    const shares = new Map<string, number>();
    for (const h of raw) {
      if (typeof h?.ticker !== "string" || typeof h?.shares !== "number") return "bad row";
      if (!(h.shares > 0) || !Number.isFinite(h.shares)) return "bad shares";
      shares.set(h.ticker.trim().toUpperCase(), h.shares);
    }
    if (raw.length !== HOLDINGS.length || shares.size !== HOLDINGS.length) return "ticker count";
    if (!HOLDINGS.every((h) => shares.has(h.ticker))) return "ticker mismatch";

    // Names and prices come from canon; only share counts come from the image.
    return HOLDINGS.map((h, i) => {
      const n = shares.get(h.ticker)!;
      return { ticker: h.ticker, name: h.name, shares: n, value: n * h.price, confidence: CONFIDENCE[i] ?? 0.99, source: "live" };
    });
  } catch (err) {
    return controller.signal.aborted ? "timeout" : err instanceof Error ? err.name : "error";
  } finally {
    clearTimeout(timer);
  }
}

// The only place holdings are produced. Scripted by default: any image (or the sample) reads as the canon portfolio.
// With NEXT_PUBLIC_LIVE_SNAP=1 a dropped file goes to Gemini; any failure falls back to the canned rows.
// Either way the scan lasts at least delayMs.
export async function extractHoldings(
  input: { file?: File; sample?: boolean },
  { delayMs = SCAN_MS }: { delayMs?: number } = {},
): Promise<ExtractedHolding[]> {
  const wait = new Promise((resolve) => setTimeout(resolve, delayMs));
  if (process.env.NEXT_PUBLIC_LIVE_SNAP !== "1" || !input.file) {
    await wait;
    return canned();
  }

  const [live] = await Promise.all([readLive(input.file), wait]);
  if (typeof live === "string") {
    console.info(`[snap] fallback: ${live}`);
    return canned();
  }
  console.info("[snap] live");
  return live;
}
