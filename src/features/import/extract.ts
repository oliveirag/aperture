import type { PriceResponse } from "@/app/api/price/route";
import type { SnapHolding, SnapResponse } from "@/app/api/snap/route";
import { HOLDINGS } from "@/data/portfolio";

// `source`: "gemini" or "ocr" for a screenshot read by Gemini or by local text recognition, "typed" for CSV or
// manual rows; the sample leaves it unset.
// `status` mirrors /api/snap: only "matched" and "unpriced" rows count toward the total.
export type ExtractedHolding = {
  ticker: string;
  name: string;
  industry: string | null;
  shares: number;
  price: number | null;
  value: number;
  status: SnapHolding["status"];
  source?: "gemini" | "ocr" | "typed";
};

export type ExtractResult = { ok: true; holdings: ExtractedHolding[]; model?: string } | { ok: false; error: string };

// The same image the drop zone draws, rendered to PNG by scripts/capture.mjs.
const SAMPLE_IMAGE = "/demo/brokerage-positions.png";

// The sample read takes exactly this long; a real read lasts at least this long.
export const SCAN_MS = 2400;

// Gemini retries across models server-side; give up a little after the server would.
const LIVE_TIMEOUT_MS = 55000;

export const counts = (h: ExtractedHolding) => h.status !== "unknown" && Number.isFinite(h.shares) && h.shares > 0 && Number.isFinite(h.value) && h.value > 0;

// The sample screenshot goes through the same reader as a dropped file (Gemini, or OCR when Gemini is unavailable).
// Only if that fails does it fall back to the demo holdings, labeled as a snapshot with no extraction.
async function readSample(): Promise<ExtractResult> {
  try {
    const res = await fetch(SAMPLE_IMAGE);
    if (res.ok) {
      const read = await readLive([new File([await res.blob()], "brokerage-positions.png", { type: "image/png" })]);
      if (read.ok) return read;
    }
  } catch {
    // Offline or blocked: use the labeled snapshot below.
  }
  return { ok: true, holdings: HOLDINGS.map(h => ({ ticker: h.ticker, name: h.name, industry: h.category, shares: h.shares, price: h.price, value: h.value, status: "matched" })) };
}

// Posts the images (one to three) to /api/snap: Gemini (or local OCR) reads them, Finnhub prices the positions.
async function readLive(files: File[]): Promise<ExtractResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
  try {
    const body = new FormData();
    for (const file of files) body.append("file", file);
    const res = await fetch("/api/snap", { method: "POST", body, signal: controller.signal });
    const data = (await res.json().catch(() => ({}))) as Partial<SnapResponse> & { error?: string };
    if (!res.ok || !Array.isArray(data.holdings)) {
      return { ok: false, error: data.error ?? "Couldn't read the screenshot. Try again in a moment." };
    }
    const source = data.method === "ocr" ? ("ocr" as const) : ("gemini" as const);
    return { ok: true, model: data.model, holdings: data.holdings.map((h) => ({ ...h, source })) };
  } catch {
    return {
      ok: false,
      error: controller.signal.aborted ? "Reading the screenshot took too long. Try again in a moment." : "Couldn't reach the server.",
    };
  } finally {
    clearTimeout(timer);
  }
}

export type TypedRow = { ticker: string; shares: number | null; marketValue: number | null; name?: string };

// Prices CSV or typed rows with Finnhub via /api/price. No Gemini involved.
async function readTyped(rows: TypedRow[]): Promise<ExtractResult> {
  try {
    const res = await fetch("/api/price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdings: rows }),
      signal: AbortSignal.timeout(60000),
    });
    const data = (await res.json().catch(() => ({}))) as Partial<PriceResponse> & { error?: string };
    if (!res.ok || !Array.isArray(data.holdings)) return { ok: false, error: data.error ?? "Couldn't price these positions." };
    return { ok: true, holdings: data.holdings.map((h) => ({ ...h, source: "typed" as const })) };
  } catch {
    return { ok: false, error: "Couldn't reach the server." };
  }
}

// The only place holdings are produced. Dropped files and the sample screenshot are read by /api/snap; typed rows are priced.
// Either way the scan lasts at least delayMs so the animation can finish.
export async function extractHoldings(
  input: { files?: File[]; sample?: boolean; rows?: TypedRow[] },
  { delayMs = SCAN_MS }: { delayMs?: number } = {},
): Promise<ExtractResult> {
  const wait = new Promise((resolve) => setTimeout(resolve, delayMs));
  const read = input.rows ? readTyped(input.rows) : input.files?.length ? readLive(input.files) : readSample();
  const [result] = await Promise.all([read, wait]);
  return result;
}
