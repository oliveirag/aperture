import { GoogleGenAI } from "@google/genai";
import { type RawHolding, type SnapHolding } from "@/lib/price-holdings";
import { admin, apiError, requireUser, sameOrigin } from "@/lib/supabase/server";
import { readRows } from "@/lib/imports/types";
import { extractionCsv, sha256 } from "@/lib/imports/csv";
import { after } from "next/server";
import { processImports } from "@/lib/imports/worker";

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
const MAX_BYTES = 4 * 1024 * 1024;
const WAVE_TIMEOUT_MS = 22000;
const TOTAL_BUDGET_MS = 45000;

const PROMPT =
  "Extract every stock and ETF position visible in this brokerage screenshot, top to bottom, including rows that are partly visible. " +
  "For each position return the ticker symbol, the share quantity, the market value in USD if shown, and the security name if shown. " +
  "Use null for anything not visible. Include USD cash and every uncertain or unsupported position for user review; never silently omit a holding. Exclude summary totals. " +
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

// Extracts all rows into a review draft. The private image expires after one hour
// and is deleted transactionally on review confirmation or logout.
export async function POST(request: Request) {
  let owner;
  try { sameOrigin(request); owner=await requireUser(); } catch(e) { return apiError(e); }
  const epoch=await admin().rpc("import_epoch",{p_owner:owner.id});
  if(epoch.error)return fail("Unable to start screenshot review.",503);
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
  if (!["image/png","image/jpeg","image/webp"].includes(file.type)) return fail("Choose a PNG, JPEG, or WebP screenshot", 415);
  if (file.size === 0) return fail("Image is empty", 400);
  if (file.size > MAX_BYTES) return fail("Image is larger than 4MB", 413);

  let read: { model: string; raw: RawHolding[] };
  const imageData=Buffer.from(await file.arrayBuffer()).toString("base64");
  try {
    read = await readImage(apiKey, file.type, imageData);
  } catch {
    return fail("Gemini couldn't read the screenshot right now. Try again in a moment.", 502);
  }

  try {
    // A logout during extraction must not resurrect an unconfirmed draft.
    const stillSignedIn=await requireUser();
    if(stillSignedIn.id!==owner.id)throw new Error("The account changed during extraction. Upload again.");
    const rows=readRows(read.raw); const csv=extractionCsv(read.raw);
    const id=crypto.randomUUID();const db=admin();
    const {error}=await db.rpc("save_screenshot",{p_id:id,p_owner:owner.id,p_rows:rows,p_csv:csv,p_hash:sha256(csv),p_mime:file.type,p_image:imageData,p_epoch:epoch.data});
    if(error) throw new Error("Unable to save extracted rows.");
    const {data:job}=await db.from("import_jobs").select("*").eq("id",id).eq("owner_id",owner.id).single();
    after(async()=>{try{await processImports();}catch{console.error("Draft pricing will resume on the scheduled worker.");}});
    return Response.json({job,model:read.model},{headers:{"Cache-Control":"no-store"}});
  }catch(e){return apiError(e);}
}
