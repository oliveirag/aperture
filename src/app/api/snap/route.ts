import { generate, geminiConfigured } from "@/lib/gemini";
import { dedupeOverlap, MAX_HOLDINGS, normalizeTicker, priceHoldings, type RawHolding, type SnapHolding } from "@/lib/price-holdings";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
// Gemini retries plus pricing can run past the default on busy days.
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 3;

const PROMPT =
  "Extract every stock and ETF position visible in this brokerage screenshot, top to bottom, including rows that are partly visible. " +
  "For each position return the ticker symbol, the share quantity, the market value in USD if shown, and the security name if shown. " +
  "Use null for anything not visible. Do not include cash, totals, options or crypto. " +
  "Ignore account numbers, owner names, balances and any other personal information.";

// Brokerage lists often span two or three screens, and consecutive screenshots usually overlap by a few rows.
const MULTI =
  " These screenshots are consecutive views of the same account and may overlap. " +
  "List each position exactly once: when the same row appears in more than one screenshot, include it only once.";

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

// Races Gemini models (see lib/gemini) until one returns a holdings array. All screenshots go in one request.
function readImages(images: { mimeType: string; data: string }[]) {
  const prompt = images.length > 1 ? PROMPT.replace("this brokerage screenshot", "these brokerage screenshots") + MULTI : PROMPT;
  return generate({
    tag: "snap",
    contents: [{ role: "user", parts: [...images.map((inlineData) => ({ inlineData })), { text: prompt }] }],
    config: { responseMimeType: "application/json", responseJsonSchema: SCHEMA },
    read: ({ text }) => {
      const raw = (JSON.parse(text) as { holdings?: unknown })?.holdings;
      if (!Array.isArray(raw)) throw new Error("no holdings array");
      return raw as RawHolding[];
    },
  });
}

// Reads one to three brokerage screenshots with Gemini, then prices every position with Finnhub.
// Images stay in memory only; they are never written or logged.
export async function POST(request: Request) {
  const limited = await rateLimit(request, "snap");
  if (limited) return limited;
  if (!geminiConfigured()) return fail("Screenshot import is not configured", 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Expected multipart/form-data", 400);
  }

  const files = form.getAll("file").filter((v): v is File => v instanceof File);
  if (files.length === 0 || files.length > MAX_FILES) return fail(`Send one to ${MAX_FILES} images`, 400);
  for (const file of files) {
    if (!file.type.startsWith("image/")) return fail("Every file must be an image", 415);
    if (file.size === 0) return fail("An image is empty", 400);
    if (file.size > MAX_BYTES) return fail("Each image must be 5MB or smaller", 413);
  }
  const many = files.length > 1;

  let read: { model: string; value: RawHolding[] };
  try {
    const images = await Promise.all(files.map(async (f) => ({ mimeType: f.type, data: Buffer.from(await f.arrayBuffer()).toString("base64") })));
    read = await readImages(images);
  } catch {
    return fail(`Gemini couldn't read the ${many ? "screenshots" : "screenshot"} right now. Try again in a moment.`, 502);
  }

  // One screenshot keeps summing repeated rows (separate lots); overlapping screenshots keep one copy per ticker.
  const raw = many ? dedupeOverlap(read.value) : read.value;
  // Never price only the first 50 and silently drop the rest: an understated portfolio is worse than a refusal.
  const distinct = new Set(raw.filter((h) => typeof h?.ticker === "string").map((h) => normalizeTicker(h.ticker))).size;
  if (distinct > MAX_HOLDINGS) {
    return fail(`We read ${distinct} positions; quick import supports ${MAX_HOLDINGS}. Nothing was imported. Use Saved imports (up to 2,000 rows) or a smaller screenshot.`, 413);
  }
  const holdings = await priceHoldings(raw);
  if (holdings.length === 0) return fail(`No positions found in ${many ? "these screenshots" : "this screenshot"}`, 422);
  const body: SnapResponse = { holdings, model: read.model };
  return Response.json(body);
}
