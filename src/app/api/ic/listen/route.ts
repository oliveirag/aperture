import { createHash } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { memo } from "@/lib/cache";
import { geminiConfigured } from "@/lib/gemini";
import { rateLimit } from "@/lib/rate-limit";
import { pcmToWav, rateOf } from "@/lib/tts/wav";

export const runtime = "nodejs";
export const maxDuration = 60;

// Tried in order; the free tier lists a flash TTS model, and names move between previews.
const MODELS = (process.env.GEMINI_TTS_MODELS ?? "gemini-3.5-flash-tts,gemini-2.5-flash-preview-tts,gemini-2.5-flash-tts").split(",");
// Two clearly different prebuilt voices, one per analyst.
const VOICES = { bull: "Puck", bear: "Kore" } as const;
const STYLE = { bull: "Read this in a confident, upbeat analyst voice:", bear: "Read this in a measured, skeptical analyst voice:" } as const;
const MAX_TEXT = 800;
const DAY = 24 * 60 * 60 * 1000;

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

async function speak(side: keyof typeof VOICES, text: string): Promise<Uint8Array> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  let lastError: unknown;
  for (const model of MODELS) {
    try {
      const res = await ai.models.generateContent({
        model: model.trim(),
        contents: [{ role: "user", parts: [{ text: `${STYLE[side]} ${text}` }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICES[side] } } },
          abortSignal: AbortSignal.timeout(25000),
        },
      });
      const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (!part?.inlineData?.data) throw new Error("no audio");
      const pcm = Buffer.from(part.inlineData.data, "base64");
      return pcmToWav(new Uint8Array(pcm), rateOf(part.inlineData.mimeType));
    } catch (err) {
      lastError = err;
      console.error(`[listen] ${model} failed:`, err instanceof Error ? err.message.slice(0, 120) : "unknown");
    }
  }
  throw lastError ?? new Error("no TTS model");
}

// One analyst's statement as speech. Body: { side: "bull" | "bear", text }. Returns audio/wav; the client falls back to
// the browser's own speech when this fails. Audio is cached per statement (in memory: clips are too big to persist).
export async function POST(request: Request) {
  const limited = await rateLimit(request, "listen");
  if (limited) return limited;
  if (!geminiConfigured()) return fail("Listen mode is not configured", 503);
  let body: { side?: unknown; text?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Expected JSON", 400);
  }
  const side = body.side === "bull" || body.side === "bear" ? body.side : null;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!side || !text || text.length > MAX_TEXT) return fail("Send { side: bull | bear, text }", 400);

  const key = createHash("sha256").update(`${side}:${text}`).digest("hex").slice(0, 24);
  try {
    const wav = await memo(`tts:${key}`, DAY, () => speak(side, text));
    return new Response(new Uint8Array(wav), { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=86400" } });
  } catch {
    return fail("Gemini couldn't read this aloud right now", 502);
  }
}
