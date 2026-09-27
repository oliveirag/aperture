import { geminiAvailable, generate } from "@/lib/gemini";
import { ocrHoldings } from "@/lib/imports/ocr";
import { rateLimit } from "@/lib/rate-limit";
import { type RawHolding, type SnapHolding } from "@/lib/price-holdings";
import { admin, apiError, requireUser, sameOrigin } from "@/lib/supabase/server";
import { readRows } from "@/lib/imports/types";
import { extractionCsv, sha256 } from "@/lib/imports/csv";
import { after } from "next/server";
import { processImports } from "@/lib/imports/worker";

export const runtime = "nodejs";
// Gemini retries (or local OCR) plus pricing can run past the default on busy days.
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;

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

async function readImage(mimeType: string, data: string) {
 const answer = await generate({tag:"import-review",contents:[{role:"user",parts:[{inlineData:{mimeType,data}},{text:PROMPT}]}],
 config:{responseMimeType:"application/json",responseJsonSchema:SCHEMA},read:({text})=>{
 const raw=(JSON.parse(text) as {holdings?:unknown}).holdings;
 if(!Array.isArray(raw))throw new Error("No holdings array");
 return raw as RawHolding[];
 }});
 return {model:answer.model,raw:answer.value};
}

// Extracts all rows into a review draft. The private image expires after one hour
// and is deleted transactionally on review confirmation or logout.
export async function POST(request: Request) {
  let owner;
  try { sameOrigin(request); owner=await requireUser(); } catch(e) { return apiError(e); }
  const limited=await rateLimit(request,"snap");
  if(limited)return limited;
  const epoch=await admin().rpc("import_epoch",{p_owner:owner.id});
  if(epoch.error)return fail("Unable to start screenshot review.",503);

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

  const buffer=Buffer.from(await file.arrayBuffer());
  const imageData=buffer.toString("base64");
  let read: { model: string; raw: RawHolding[] } | null = null;
  if (geminiAvailable()) {
    try { read = await readImage(file.type, imageData); }
    catch (err) { console.error("[import-review] Gemini unavailable, using OCR:", err instanceof Error ? err.message.slice(0, 120) : "unknown"); }
  }
  if (!read) {
    try { read = { model: "Tesseract OCR", raw: await ocrHoldings([buffer]) }; }
    catch { return fail("Couldn't read the screenshot right now. Try CSV or typing the positions.", 502); }
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
