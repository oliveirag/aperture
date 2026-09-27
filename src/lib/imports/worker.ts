import { admin } from "@/lib/supabase/server";
import { getQuote, getProfile } from "./quotes";
import { computeXray, type ApertureInput } from "@/lib/xray/compute";
import { getEtfProfile } from "@/lib/etf";
import { companyFor } from "@/lib/sec";
import { QuotaWait } from "./provider";
import { reviewedSource, reviewedValueInput } from "./valuation";
import { mergeInputs, rowProblem, type ImportJob, type ImportRow, type PositionResult } from "./types";

// Use the shared ETF adapter, not a second Alpha-only importer. C's adapter
// must supply actual source provenance before holdings can be called verified.
async function fund(ticker: string): Promise<NonNullable<ApertureInput["etf"]> | null> {
  const profile: ApertureInput["etf"] | null = await getEtfProfile(ticker);
  return profile?.provenance ? profile : null;
}

export async function resolvePosition(row: ImportRow, previous: PositionResult, review=false, reviewedAt?: string): Promise<PositionResult> {
  if (row.excluded) return { state:"ready",attempts:0 };
  const problem = rowProblem(row);
  if (problem && !review) return {state:"needs_input",attempts:0,error:problem};
  if (review || !reviewedAt) return {state:"needs_input",attempts:0,error:"User review and its recorded confirmation time are required before valuation."};
  if (row.kind === "cash" || row.kind === "unsupported") return {state:"ready",attempts:0,input:reviewedValueInput(row,reviewedAt),warnings:row.kind === "unsupported"?["Unsupported security; reviewed value retained, look-through unavailable."]:[]};
  let valuation = previous.valuation;
  try {
    if (!valuation) {
      const q = await getQuote(row.ticker);
      if (q && q.retrievedAt) valuation = {price:q.price,source:"Finnhub",asOf:new Date(q.time*1000).toISOString(),retrievedAt:q.retrievedAt,provenance:{kind:"retrieved",provider:"finnhub",endpoint:`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(row.ticker)}`,retrievedAt:q.retrievedAt,asOf:new Date(q.time*1000).toISOString()}};
      else if (row.marketValue && row.valuationDate) valuation = {price:row.marketValue/row.shares!,source:"User-confirmed brokerage valuation",asOf:row.valuationDate,retrievedAt:reviewedAt,provenance:reviewedSource(row,reviewedAt)};
      else return {state:"needs_input",attempts:previous.attempts,error:"No quote found. Verify the ticker or provide a dated market value."};
      return {state:"pending",attempts:previous.attempts,valuation};
    }
    const input: ApertureInput = {ticker:row.ticker,name:row.name || row.ticker,shares:row.shares!,price:valuation.price,kind:row.kind as "stock"|"etf",provenance:valuation.provenance ? {kind:"computed",formula:"reviewed share quantity × sourced unit price",inputs:[reviewedSource(row,reviewedAt),valuation.provenance]} : undefined};
    const warnings:string[]=[];
    if (row.kind === "etf") {
      const holdings = await fund(row.ticker).catch(()=>null);
      if (holdings) input.etf = holdings;
      else { input.kind="opaque"; warnings.push("Verified ETF holdings unavailable; position value retained without look-through."); }
    }
    else {
      // The reviewed security type is authoritative. Optional company metadata
      // must not hold up an otherwise valued, confirmed stock position.
      const profile = await getProfile(row.ticker).catch(()=>null);
      if(profile){input.name=profile.name;input.industry=profile.industry;}
      else {
        const sec = await companyFor(row.ticker).catch(()=>null);
        if (!sec) { input.kind="opaque"; warnings.push("Ticker could not be verified against Finnhub or SEC; value retained as unsupported exposure."); }
        else warnings.push("SEC ticker verified; Finnhub sector metadata unavailable. Sector is unclassified.");
      }
    }
    return {state:"ready",attempts:previous.attempts,valuation,input,warnings};
  } catch (error) {
    if (error instanceof QuotaWait) return {state:"pending",attempts:previous.attempts,valuation,retryAt:error.retryAt,error:error.message};
    const attempts = previous.attempts+1;
    if(!valuation && attempts>=4 && row.marketValue && row.shares && row.valuationDate && !review) return {state:"pending",attempts:0,valuation:{price:row.marketValue/row.shares,source:"User-confirmed brokerage valuation after provider failure",asOf:row.valuationDate,retrievedAt:reviewedAt,provenance:reviewedSource(row,reviewedAt)}};
    return {state:attempts>=4?"blocked":"pending",attempts,valuation,error:error instanceof Error?error.message:"Provider unavailable",retryAt:new Date(Date.now()+Math.min(300000,10000*2**attempts)).toISOString()};
  }
}

// Bounded work with a database lease and fenced commits; no in-process timers.
export async function processImports() {
  const db=admin();
  const {data,error}=await db.rpc("claim_import");
  if(error) throw new Error("Unable to claim import work. Apply the Supabase migration.");
  const job=data?.[0] as (ImportJob & {lease_token:string}) | undefined;
  if(!job) return {processed:0};
  const deadline=Date.now()+35000;
  const results=job.rows.map((_,i)=>job.results[i] ?? {state:"pending",attempts:0} as PositionResult);
  let processed=0;
  const order=results.map((_,i)=>i).sort((a,b)=>Number(Boolean(results[a].valuation))-Number(Boolean(results[b].valuation)));
  const eligible=order.filter(i=>results[i].state==="pending" && (!results[i].retryAt || Date.parse(results[i].retryAt!)<=Date.now()) && !(job.status==="review"&&results[i].valuation));
  for(let offset=0;offset<eligible.length;offset+=4) {
    if(Date.now()>=deadline)break;
    const batch=eligible.slice(offset,offset+4);
    const settled=await Promise.all(batch.map(i=>resolvePosition(job.rows[i],results[i],job.status==="review",job.confirmed_at??undefined)));
    batch.forEach((i,n)=>{results[i]=settled[n];processed++;});
    const checkpoint=await db.rpc("checkpoint_import",{p_id:job.id,p_token:job.lease_token,p_results:results});
    if(checkpoint.error || !checkpoint.data)return {processed,committed:false};
  }
  const pending=results.filter(r=>r.state==="pending");
  const status=job.status==="review"?"review":pending.length?"processing":results.every(r=>r.state==="ready")?"complete":"needs_input";
  const waiting=job.status==="review"?pending.filter(r=>!r.valuation):pending;
  const next=waiting.length?Math.min(...waiting.map(r=>r.retryAt?Date.parse(r.retryAt):Date.now())):Date.now()+3600000;
  const model=status==="complete"?computeXray(mergeInputs(results),new Map()):null;
  const saved=await db.rpc("save_import_work",{p_id:job.id,p_token:job.lease_token,p_results:results,p_status:status,p_retry:new Date(next).toISOString(),p_model:model});
  if(saved.error) throw new Error("Unable to persist import progress.");
  return {processed,committed:saved.data};
}
