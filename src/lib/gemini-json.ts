// Server-only: one structured-JSON Gemini call that falls back across Flash models when one is overloaded (503) or
// stalls. Sequential rather than raced, so a text-only job spends one request of quota when the first model answers.
import { GoogleGenAI, type Part } from "@google/genai";

// Lite is second: on the free tier it is the one most often still answering when the others are at quota or busy.
const MODELS = ["gemini-3.8-flash", "gemini-flash-lite-latest", "gemini-flash-latest", "gemini-3.5-flash"];
// A model that answered 429 (quota) is skipped for a while instead of costing every request an attempt.
const QUOTA_COOLDOWN_MS = 10 * 60 * 1000;
const coolingUntil = new Map<string, number>();

export async function generateJson<T>({
  parts,
  schema,
  validate,
  attemptMs = 25000,
  budgetMs = 75000,
  label,
}: {
  parts: Part[];
  schema: object;
  // Returns the parsed value, or throws to try the next model (e.g. nothing survived validation).
  validate: (raw: unknown) => T;
  attemptMs?: number;
  budgetMs?: number;
  label: string;
}): Promise<{ value: T; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const ai = new GoogleGenAI({ apiKey });
  const deadline = Date.now() + budgetMs;
  let lastError: unknown;
  for (const model of MODELS) {
    const remaining = deadline - Date.now();
    if (remaining < 5000) break;
    if ((coolingUntil.get(model) ?? 0) > Date.now()) continue;
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: schema,
          abortSignal: AbortSignal.timeout(Math.min(attemptMs, remaining)),
        },
      });
      return { value: validate(JSON.parse(response.text ?? "")), model };
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : "";
      if (message.includes('"code":429')) coolingUntil.set(model, Date.now() + QUOTA_COOLDOWN_MS);
      console.error(`[${label}] ${model} failed:`, err instanceof Error ? err.message.slice(0, 140) : "unknown");
    }
  }
  throw lastError ?? new Error("no model attempted");
}
