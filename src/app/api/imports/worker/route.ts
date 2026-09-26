import { timingSafeEqual } from "node:crypto";
import { processImports } from "@/lib/imports/worker";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(request:Request) {
  const secret=process.env.IMPORT_WORKER_SECRET;
  const supplied=request.headers.get("authorization") ?? "";
  const expected=`Bearer ${secret}`;
  const suppliedBytes=Buffer.from(supplied),expectedBytes=Buffer.from(expected);
  if(!secret || suppliedBytes.length!==expectedBytes.length || !timingSafeEqual(suppliedBytes,expectedBytes)) return new Response("Unauthorized",{status:401});
  try { return Response.json(await processImports()); }
  catch {return Response.json({error:"Worker failed; durable work will be retried."},{status:503});}
}
