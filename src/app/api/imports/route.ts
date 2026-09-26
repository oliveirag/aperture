import { after } from "next/server";
import { admin, apiError, requireUser, sameOrigin } from "@/lib/supabase/server";
import { readRows, rowProblem } from "@/lib/imports/types";
import { auditCsv, extractionCsv, identityCsv, sha256 } from "@/lib/imports/csv";
import { processImports } from "@/lib/imports/worker";

export const runtime="nodejs";
export const maxDuration=60;
const json=(body:unknown)=>Response.json(body,{headers:{"Cache-Control":"no-store"}});
export async function GET(request:Request) {
  try {
    const user=await requireUser(); const db=admin();
    const rawOffset=Number(new URL(request.url).searchParams.get("historyOffset")??0);
    const offset=Number.isSafeInteger(rawOffset)&&rawOffset>=0?rawOffset:0;
    const [jobs,snapshots,events]=await Promise.all([
      db.from("import_jobs").select("*").eq("owner_id",user.id).neq("status","cancelled").order("created_at",{ascending:false}).limit(30),
      db.from("portfolio_snapshots").select("*").eq("owner_id",user.id).order("created_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+29),
      db.from("import_events").select("*").eq("owner_id",user.id).order("id",{ascending:false}).limit(100),
    ]);
    if(jobs.error || snapshots.error || events.error) throw new Error("Unable to load imports. Check the database migration.");
    return json({jobs:jobs.data,snapshots:snapshots.data,events:events.data});
  } catch(e) {return apiError(e);}
}
export async function POST(request:Request) {
  try {
    sameOrigin(request); const user=await requireUser(); const db=admin();
    const body=await request.json();
    if(body.action==="create") {
      if(typeof body.id!=="string" || !/^[0-9a-f-]{36}$/i.test(body.id)) throw new Error("Invalid import identifier.");
      const rows=readRows(body.rows); const csv=extractionCsv(body.rows);
      const existing=await db.from("import_jobs").select("*").eq("id",body.id).eq("owner_id",user.id).maybeSingle();
      if(existing.error) throw new Error("Unable to read import.");
      if(existing.data) return json({job:existing.data});
      const {data,error}=await db.from("import_jobs").insert({id:body.id,owner_id:user.id,source:body.source==="screenshot"?"screenshot":"rows",original:rows,rows,original_csv:csv,original_hash:sha256(csv)}).select().single();
      if(error) throw new Error("Unable to save import draft.");
      after(async()=>{try{await processImports();}catch{console.error("Draft pricing will resume on the scheduled worker.");}});
      return json({job:data});
    }
    const {data:job,error}=await db.from("import_jobs").select("*").eq("id",body.id).eq("owner_id",user.id).single();
    if(error || !job) throw new Error("Import not found.");
    if(body.action==="cancel") {
      if(job.confirmed_at) throw new Error("A confirmed import cannot be discarded as a draft.");
      const result=await db.rpc("cancel_import_drafts",{p_owner:user.id,p_id:job.id});
      if(result.error) throw new Error("Unable to cancel draft.");
      return json({ok:true});
    }
    if(body.action!=="confirm") throw new Error("Unknown import action.");
    const rows=readRows(body.rows);
    const problem=rows.map((r,i)=>rowProblem(r)?`Row ${i+1}: ${rowProblem(r)}`:null).find(Boolean);
    if(problem) throw new Error(problem);
    if(rows.every(r=>r.excluded)) throw new Error("At least one holding is required.");
    const types=new Map<string,string>();
    for(const row of rows.filter(r=>!r.excluded&&r.kind!=="cash")) {
      if(types.has(row.ticker)&&types.get(row.ticker)!==row.kind)throw new Error(`Conflicting instrument types for ${row.ticker}.`);
      types.set(row.ticker,row.kind);
    }
    const csv=auditCsv(rows); const identity=identityCsv(rows);
    const result=await db.rpc("confirm_import",{p_id:job.id,p_owner:user.id,p_revision:body.revision,p_rows:rows,p_csv:csv,p_hash:sha256(csv),p_identity:identity,p_identity_hash:sha256(identity)});
    if(result.error) throw new Error("Import changed or could not be confirmed. Reload and try again.");
    after(async()=>{try{await processImports();}catch(e){console.error("Import worker failed",e instanceof Error?e.message:"unknown");}});
    const current=await db.from("import_jobs").select("*").eq("id",result.data).eq("owner_id",user.id).single();
    return json({job:current.data});
  } catch(e) {return apiError(e);}
}
