// Server-only Gemini client with model racing and key rotation. Import it from route handlers only: it reads
// GEMINI_API_KEYS (comma-separated) and/or GEMINI_API_KEY.
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

// Every configured key, in order. Extra keys only matter when an earlier one is out of quota or rejected.
function keys() {
  const list = [...(process.env.GEMINI_API_KEYS ?? "").split(","), process.env.GEMINI_API_KEY ?? ""].map((k) => k.trim()).filter(Boolean);
  return [...new Set(list)];
}

// Keys that answered with a quota, billing or auth error, benched until the given time so requests fail over at once.
const benched = new Map<string, number>();
const clients = new Map<string, GoogleGenAI>();

function usableKeys() {
  const now = Date.now();
  return keys().filter((k) => (benched.get(k) ?? 0) <= now);
}

function clientFor(apiKey: string) {
  let c = clients.get(apiKey);
  if (!c) clients.set(apiKey, (c = new GoogleGenAI({ apiKey })));
  return c;
}

export function geminiConfigured() {
  return keys().length > 0;
}

// False while every configured key is benched. Callers use it to go straight to their non-model path.
export function geminiAvailable() {
  return usableKeys().length > 0;
}

const MINUTE = 60 * 1000;

// How long a key sits out after this error, 0 when the error is about the request rather than the key, or null
// when it says nothing about the key (a model this key can't use, which other models may still serve).
function benchFor(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  if (/\b404\b|NOT_FOUND/.test(msg)) return null;
  if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED|\b40[13]\b/i.test(msg)) return 60 * MINUTE;
  if (/spending cap|billing|per ?day|PerDay/i.test(msg)) return 60 * MINUTE;
  if (/\b429\b|RESOURCE_EXHAUSTED|quota/i.test(msg)) return MINUTE;
  return 0;
}

function bench(apiKey: string, ms: number, tag: string) {
  benched.set(apiKey, Date.now() + ms);
  const left = usableKeys().length;
  console.error(`[${tag}] Gemini key ${keys().indexOf(apiKey) + 1}/${keys().length} benched for ${Math.round(ms / MINUTE)} min; ${left} usable`);
}

class KeyFailure extends Error {
  constructor(readonly benchMs: number) {
    super("every model rejected this API key");
  }
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
    // Shortest bench any model asked for; stays 0 unless every model failed because of the key.
    let keyBench = Infinity;
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
          const ms = benchFor(err);
          if (ms !== null) keyBench = Math.min(keyBench, ms);
          if (!settled) console.error(`[${req.tag}] ${model} failed:`, err instanceof Error ? err.message.slice(0, 120) : "unknown");
        })
        .finally(() => {
          pending--;
          if (pending > 0 || settled) return;
          if (liteAnswer) return finish(liteAnswer);
          clearTimeout(timer);
          reject(keyBench > 0 && keyBench !== Infinity ? new KeyFailure(keyBench) : new Error("all models in wave failed"));
        });
    }
  });
}

// Runs a request across the waves until one model returns a value `read` accepts. A key that every model
// rejects (quota, billing cap, invalid) is benched and the request moves on to the next key.
export async function generate<T>(req: Request<T>): Promise<Answer<T>> {
  if (!geminiConfigured()) throw new Error("GEMINI_API_KEY is not set");
  const deadline = Date.now() + (req.budgetMs ?? TOTAL_BUDGET_MS);
  let lastError: unknown = new Error("every Gemini key is out of quota or rejected");
  for (const apiKey of usableKeys()) {
    const ai = clientFor(apiKey);
    for (const wave of WAVES) {
      const remaining = deadline - Date.now();
      if (remaining < 3000) throw lastError;
      try {
        return await raceWave(ai, wave, req, Math.min(req.waveTimeoutMs ?? WAVE_TIMEOUT_MS, remaining));
      } catch (err) {
        lastError = err;
        if (err instanceof KeyFailure) {
          bench(apiKey, err.benchMs, req.tag);
          break;
        }
      }
    }
  }
  throw lastError;
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
// A sentence of the grounded answer and the citations (indexes into `citations`) that support it.
export type GroundedClaim = { text: string; citations: number[] };

// Free text grounded with Google Search. Grounding can't be combined with a JSON schema, so it is its own call.
export function generateGrounded(opts: {
  tag: string;
  prompt: string;
  system?: string;
  budgetMs?: number;
}): Promise<Answer<{ text: string; citations: WebCitation[]; claims: GroundedClaim[] }>> {
  return generate({
    tag: opts.tag,
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
    config: { tools: [{ googleSearch: {} }], systemInstruction: opts.system },
    read: ({ text, raw }) => {
      if (!text.trim()) throw new Error("empty grounded answer");
      const meta = raw.candidates?.[0]?.groundingMetadata;
      const citations: WebCitation[] = (meta?.groundingChunks ?? []).map((c) => {
        const url = c.web?.uri ?? "";
        return { title: c.web?.title ?? (url ? new URL(url).hostname : "Web"), url };
      });
      const claims: GroundedClaim[] = (meta?.groundingSupports ?? [])
        .map((s) => ({
          text: (s.segment?.text ?? "").trim(),
          citations: (s.groundingChunkIndices ?? []).filter((i) => citations[i]?.url),
        }))
        .filter((c) => c.text && c.citations.length > 0);
      return { text, citations, claims };
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
  let lastError: unknown = new Error("every Gemini key is out of quota or rejected");
  for (const [apiKey, model] of usableKeys().flatMap((k) => STREAM_ORDER.map((m) => [k, m] as const))) {
    if ((benched.get(apiKey) ?? 0) > Date.now()) continue;
    const ai = clientFor(apiKey);
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
      const ms = benchFor(err);
      if (ms) bench(apiKey, ms, opts.tag);
    }
  }
  throw lastError ?? new Error("no model attempted");
}
