// Server-only Gemini client with model racing. Import it from route handlers only: it reads GEMINI_API_KEY.
import { GoogleGenAI, type Content, type GenerateContentConfig, type Part } from "@google/genai";

// Each wave races its models in parallel and keeps the first valid answer. The free tier often answers 503
// "high demand" or stalls, so a second wave tries other models. Lite models are fast but read a little less carefully.
export const WAVES = [
  ["gemini-3.8-flash", "gemini-flash-latest", "gemini-flash-lite-latest"],
  ["gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"],
];
// Streaming answers can't be raced, so they try one model at a time in this order.
const STREAM_ORDER = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.7-flash", "gemini-flash-lite-latest", "gemini-3.5-flash"];
// Before accepting a lite answer, give the full models this long to finish.
const PREFER_FULL_MS = 4000;
const WAVE_TIMEOUT_MS = 22000;
const TOTAL_BUDGET_MS = 45000;

export function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function client() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey });
}

export type Answer<T> = { model: string; value: T };

type Request<T> = {
  // Short label for logs ("snap", "radar").
  tag: string;
  contents: Content[];
  config?: Omit<GenerateContentConfig, "abortSignal">;
  // Turns the raw response into a value, or throws to reject this model's answer.
  read: (response: { text: string; raw: Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>> }) => T;
  waveTimeoutMs?: number;
  budgetMs?: number;
};

// Races one wave. A full model's answer wins immediately; a lite answer waits up to PREFER_FULL_MS for a full one.
function raceWave<T>(ai: GoogleGenAI, models: string[], req: Request<T>, timeoutMs: number): Promise<Answer<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return new Promise<Answer<T>>((resolve, reject) => {
    let pending = models.length;
    let liteAnswer: Answer<T> | null = null;
    let settled = false;
    const finish = (r: Answer<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      controller.abort();
      resolve(r);
    };
    for (const model of models) {
      ai.models
        .generateContent({ model, contents: req.contents, config: { ...req.config, abortSignal: controller.signal } })
        .then((raw) => ({ model, value: req.read({ text: raw.text ?? "", raw }) }))
        .then((r) => {
          if (!model.includes("lite")) return finish(r);
          liteAnswer = r;
          setTimeout(() => finish(r), PREFER_FULL_MS);
        })
        .catch((err) => {
          if (!settled) console.error(`[${req.tag}] ${model} failed:`, err instanceof Error ? err.message.slice(0, 120) : "unknown");
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

// Runs a request across the waves until one model returns a value `read` accepts.
export async function generate<T>(req: Request<T>): Promise<Answer<T>> {
  const ai = client();
  const deadline = Date.now() + (req.budgetMs ?? TOTAL_BUDGET_MS);
  let lastError: unknown;
  for (const wave of WAVES) {
    const remaining = deadline - Date.now();
    if (remaining < 3000) break;
    try {
      return await raceWave(ai, wave, req, Math.min(req.waveTimeoutMs ?? WAVE_TIMEOUT_MS, remaining));
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("no model attempted");
}

// Structured output: the response must be JSON matching `schema`, then pass `validate` (which throws to reject it).
export function generateJson<T>(opts: {
  tag: string;
  parts: Part[];
  schema: object;
  validate: (value: unknown) => T;
  system?: string;
  temperature?: number;
  waveTimeoutMs?: number;
  budgetMs?: number;
}): Promise<Answer<T>> {
  return generate({
    tag: opts.tag,
    contents: [{ role: "user", parts: opts.parts }],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: opts.schema,
      systemInstruction: opts.system,
      temperature: opts.temperature,
    },
    read: ({ text }) => opts.validate(JSON.parse(text)),
    waveTimeoutMs: opts.waveTimeoutMs,
    budgetMs: opts.budgetMs,
  });
}

export type WebCitation = { title: string; url: string };

// Free text grounded with Google Search. Grounding can't be combined with a JSON schema, so it is its own call.
export function generateGrounded(opts: { tag: string; prompt: string; system?: string; budgetMs?: number }): Promise<Answer<{ text: string; citations: WebCitation[] }>> {
  return generate({
    tag: opts.tag,
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    config: { tools: [{ googleSearch: {} }], systemInstruction: opts.system },
    read: ({ text, raw }) => {
      if (!text.trim()) throw new Error("empty grounded answer");
      const chunks = raw.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const seen = new Set<string>();
      const citations: WebCitation[] = [];
      for (const c of chunks) {
        const url = c.web?.uri;
        if (!url || seen.has(url)) continue;
        seen.add(url);
        citations.push({ title: c.web?.title ?? new URL(url).hostname, url });
      }
      return { text, citations };
    },
    budgetMs: opts.budgetMs,
  });
}

// Streams plain text. Falls through to the next model when one fails before its first token (503s, stalls).
export async function* streamText(opts: {
  tag: string;
  contents: Content[];
  system?: string;
  firstTokenMs?: number;
  signal?: AbortSignal;
}): AsyncGenerator<string> {
  const ai = client();
  let lastError: unknown;
  for (const model of STREAM_ORDER) {
    const controller = new AbortController();
    opts.signal?.addEventListener("abort", () => controller.abort(), { once: true });
    const timer = setTimeout(() => controller.abort(), opts.firstTokenMs ?? 8000);
    let started = false;
    try {
      const stream = await ai.models.generateContentStream({
        model,
        contents: opts.contents,
        config: { systemInstruction: opts.system, abortSignal: controller.signal },
      });
      for await (const chunk of stream) {
        const text = chunk.text ?? "";
        if (!text) continue;
        if (!started) {
          started = true;
          clearTimeout(timer);
        }
        yield text;
      }
      if (started) return;
      lastError = new Error("empty stream");
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      console.error(`[${opts.tag}] ${model} stream failed:`, err instanceof Error ? err.message.slice(0, 120) : "unknown");
      // Once tokens reached the user a retry would repeat them; surface the error instead.
      if (started || opts.signal?.aborted) throw err;
    }
  }
  throw lastError ?? new Error("no model attempted");
}
