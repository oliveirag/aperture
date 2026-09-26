import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";

const MODEL = "gemini-3.8-flash";
const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 7500;

const PROMPT =
  "Extract the stock and ETF positions visible in this brokerage screenshot. Return only ticker and share quantity for each position. Ignore account numbers, names, balances and any personal information.";

const SCHEMA = {
  type: "object",
  properties: {
    holdings: {
      type: "array",
      items: {
        type: "object",
        properties: { ticker: { type: "string" }, shares: { type: "number" } },
        required: ["ticker", "shares"],
      },
    },
  },
  required: ["holdings"],
};

type SnapHolding = { ticker: string; shares: number };

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

// Reads one brokerage screenshot with Gemini. The image stays in memory only; it is never written or logged.
export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fail("Live import is not configured", 503);

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

  try {
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: file.type, data } }, { text: PROMPT }] }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: SCHEMA,
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      },
    });

    const parsed: unknown = JSON.parse(response.text ?? "");
    const raw = (parsed as { holdings?: unknown })?.holdings;
    if (!Array.isArray(raw)) return fail("Model returned no holdings", 502);
    const holdings: SnapHolding[] = raw
      .filter((h): h is SnapHolding => typeof h?.ticker === "string" && typeof h?.shares === "number")
      .map((h) => ({ ticker: h.ticker.trim().toUpperCase(), shares: h.shares }));
    return Response.json({ holdings });
  } catch (err) {
    // Log only the failure kind, never the request body.
    console.error("[snap] gemini failed:", err instanceof Error ? err.name : "unknown");
    return fail("Could not read the screenshot", 502);
  }
}
