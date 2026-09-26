import { GoogleGenAI } from "@google/genai";
import { priceHoldings, type RawHolding, type SnapHolding } from "@/lib/price-holdings";

export const runtime = "nodejs";
// Gemini retries plus pricing can run past the default on busy days.
export const maxDuration = 60;

// Each wave races its models in parallel and keeps the first valid answer. The free tier often answers 503
// "high demand" or stalls, so a second wave tries other models. Lite models are fast but read a little less carefully.
const WAVES = [
  ["gemini-3.8-flash", "gemini-flash-latest", "gemini-flash-lite-latest"],
  ["gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"],
];
// Before accepting a lite answer, give the full models this long to finish.
const PREFER_FULL_MS = 4000;
const MAX_BYTES = 5 * 1024 * 1024;
const WAVE_TIMEOUT_MS = 22000;
const TOTAL_BUDGET_MS = 45000;

const PROMPT =
  "Extract every stock and ETF position visible in this brokerage screenshot, top to bottom, including rows that are partly visible. " +
  "For each position return the ticker symbol, the share quantity, the market value in USD if shown, and the security name if shown. " +
  "Use null for anything not visible. Do not include cash, totals, options or crypto. " +
  "Ignore account numbers, owner names, balances and any other personal information.";

const SCHEMA = {
  type: "object",
  properties: {
    holdings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ticker: { type: "string" },
          shares: { type: ["number", "null"] },
          marketValue: { type: ["number", "null"] },
          name: { type: ["string", "null"] },
        },
        required: ["ticker", "shares", "marketValue", "name"],
      },
    },
  },
  required: ["holdings"],
};


export type { SnapHolding };
export type SnapResponse = { holdings: SnapHolding[]; model: string };

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

async function readWith(ai: GoogleGenAI, model: string, mimeType: string, data: string, signal: AbortSignal) {
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ inlineData: { mimeType, data } }, { text: PROMPT }] }],
    config: { responseMimeType: "application/json", responseJsonSchema: SCHEMA, abortSignal: signal },
  });
  const parsed: unknown = JSON.parse(response.text ?? "");
  const raw = (parsed as { holdings?: unknown })?.holdings;
  if (!Array.isArray(raw)) throw new Error("no holdings array");
  return { model, raw: raw as RawHolding[] };
}

type Read = { model: string; raw: RawHolding[] };

// Races one wave. A full model's answer wins immediately; a lite answer waits up to PREFER_FULL_MS for a full one.
function raceWave(ai: GoogleGenAI, models: string[], mimeType: string, data: string, timeoutMs: number): Promise<Read> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return new Promise<Read>((resolve, reject) => {
    let pending = models.length;
    let liteAnswer: Read | null = null;
    let settled = false;
    const finish = (r: Read) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      controller.abort();
      resolve(r);
    };
    for (const model of models) {
      readWith(ai, model, mimeType, data, controller.signal)
        .then((r) => {
          if (!model.includes("lite")) return finish(r);
          liteAnswer = r;
          setTimeout(() => finish(r), PREFER_FULL_MS);
        })
        .catch((err) => {
          if (!settled) console.error(`[snap] ${model} failed:`, err instanceof Error ? err.message.slice(0, 120) : "unknown");
        })
        .finally(() => {
          pending--;
          if (pending > 0 || settled) return;
          if (liteAnswer) return finish(liteAnswer);
          clearTimeout(timer);
          reject(new Error("all models in wave failed"));
        });
    }
  });
}

async function readImage(apiKey: string, mimeType: string, data: string) {
  const ai = new GoogleGenAI({ apiKey });
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let lastError: unknown;
  for (const wave of WAVES) {
    const remaining = deadline - Date.now();
    if (remaining < 3000) break;
    try {
      return await raceWave(ai, wave, mimeType, data, Math.min(WAVE_TIMEOUT_MS, remaining));
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("no model attempted");
}

// Reads one brokerage screenshot with Gemini, then prices every position with Finnhub.
// The image stays in memory only; it is never written or logged.
export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fail("Screenshot import is not configured", 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Expected multipart/form-data", 400);
  }

  const files = form.getAll("file").filter((v): v is File => v instanceof File);
  if (files.length !== 1) return fail("Send exactly one image", 400);
  const [file] = files;
  if (!file.type.startsWith("image/")) return fail("File must be an image", 415);
  if (file.size === 0) return fail("Image is empty", 400);
  if (file.size > MAX_BYTES) return fail("Image is larger than 5MB", 413);

  let read: { model: string; raw: RawHolding[] };
  try {
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    read = await readImage(apiKey, file.type, data);
  } catch {
    return fail("Gemini couldn't read the screenshot right now. Try again in a moment.", 502);
  }

  const holdings = await priceHoldings(read.raw);
  if (holdings.length === 0) return fail("No positions found in this screenshot", 422);
  const body: SnapResponse = { holdings, model: read.model };
  return Response.json(body);
}
