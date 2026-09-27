import { answerFromData } from "@/lib/ask/offline";
import { DECLINE, DISCLAIMER, isBuySellQuestion, systemPrompt } from "@/lib/ask/prompt";
import { geminiAvailable, streamText } from "@/lib/gemini";
import type { Level } from "@/lib/level";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_QUESTION = 500;
const MAX_CONTEXT = 60_000;
const MAX_TURNS = 6;
const LEVELS = new Set(["beginner", "intermediate", "advanced"]);

type Turn = { role: "user" | "assistant"; text: string };

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

const TEXT = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };

// Chat grounded in the user's own portfolio. Body: { question, level, context, history? }, where context is the compact
// JSON the page already computed (X-Ray, Radar, IC memos). Streams plain text; X-Ask-Declined marks a buy/sell refusal.
export async function POST(request: Request) {
  const limited = await rateLimit(request, "ask");
  if (limited) return limited;
  let body: { question?: unknown; level?: unknown; context?: unknown; history?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Expected JSON", 400);
  }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length > MAX_QUESTION) return fail(`Ask a question of at most ${MAX_QUESTION} characters`, 400);
  const level = (LEVELS.has(body.level as string) ? body.level : "intermediate") as Level;
  const context = JSON.stringify(body.context ?? null);
  if (context.length > MAX_CONTEXT) return fail("Portfolio context is too large", 413);
  const history = (Array.isArray(body.history) ? (body.history as Turn[]) : [])
    .filter((t) => (t?.role === "user" || t?.role === "assistant") && typeof t.text === "string")
    .slice(-MAX_TURNS)
    .map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.text.slice(0, 2000) }] }));

  if (isBuySellQuestion(question)) {
    return new Response(`${DECLINE}\n\n${DISCLAIMER}`, { headers: { ...TEXT, "X-Ask-Declined": "1" } });
  }
  // Without Gemini, answer from the portfolio data itself rather than failing.
  if (!geminiAvailable()) return new Response(answerFromData(question, body.context), { headers: { ...TEXT, "X-Ask-Offline": "1" } });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let started = false;
      try {
        for await (const chunk of streamText({
          tag: "ask",
          system: `${systemPrompt(level)}\n\nPortfolio data (JSON):\n${context}`,
          contents: [...history, { role: "user", parts: [{ text: question }] }],
          firstTokenMs: 6000,
          signal: request.signal,
        })) {
          started = true;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        console.error("[ask] failed:", err instanceof Error ? err.message.slice(0, 120) : "unknown");
        // Before any text reached the user, a data answer replaces the failed one; mid-answer, say it was cut off.
        controller.enqueue(encoder.encode(started ? "\n\nSorry, I couldn't finish that answer. Try again in a moment." : answerFromData(question, body.context)));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: TEXT });
}
