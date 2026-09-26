import { generate, geminiConfigured } from "@/lib/gemini";
import { priceHoldings, type RawHolding, type SnapHolding } from "@/lib/price-holdings";

export const runtime = "nodejs";
// Gemini retries plus pricing can run past the default on busy days.
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024;

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

// Races Gemini models (see lib/gemini) until one returns a holdings array.
function readImage(mimeType: string, data: string) {
  return generate({
    tag: "snap",
    contents: [{ role: "user", parts: [{ inlineData: { mimeType, data } }, { text: PROMPT }] }],
    config: { responseMimeType: "application/json", responseJsonSchema: SCHEMA },
    read: ({ text }) => {
      const raw = (JSON.parse(text) as { holdings?: unknown })?.holdings;
      if (!Array.isArray(raw)) throw new Error("no holdings array");
      return raw as RawHolding[];
    },
  });
}

// Reads one brokerage screenshot with Gemini, then prices every position with Finnhub.
// The image stays in memory only; it is never written or logged.
export async function POST(request: Request) {
  if (!geminiConfigured()) return fail("Screenshot import is not configured", 503);

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

  let read: { model: string; value: RawHolding[] };
  try {
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    read = await readImage(file.type, data);
  } catch {
    return fail("Gemini couldn't read the screenshot right now. Try again in a moment.", 502);
  }

  const holdings = await priceHoldings(read.value);
  if (holdings.length === 0) return fail("No positions found in this screenshot", 422);
  const body: SnapResponse = { holdings, model: read.model };
  return Response.json(body);
}
