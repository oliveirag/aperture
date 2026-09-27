import { admin } from "@/lib/supabase/server";
import { getQuote, getProfile } from "./quotes";
import { computeXray, type ApertureInput } from "@/lib/xray/compute";
import { sectorFromGics } from "@/lib/sectors";
import { cachedProvider, reserve, cooldown, QuotaWait } from "./provider";
import { mergeInputs, rowProblem, type ImportJob, type ImportRow, type PositionResult } from "./types";

async function fund(ticker: string): Promise<NonNullable<ApertureInput["etf"]>> {
  return cachedProvider(`verified-etf:${ticker}`,86400000, async () => {
    if (!process.env.ALPHA_VANTAGE_API_KEY) throw new Error("ETF holdings provider is not configured.");
    await reserve("alpha");
    const url = new URL("https://www.alphavantage.co/query");
    url.search = new URLSearchParams({ function: "ETF_PROFILE", symbol: ticker, apikey: process.env.ALPHA_VANTAGE_API_KEY }).toString();
    const response = await fetch(url,{ cache:"no-store", signal:AbortSignal.timeout(8000) });
    if (response.status === 429) await cooldown("alpha",86400);
    if (!response.ok) throw new Error(`ETF provider HTTP ${response.status}`);
    const raw = await response.json();
    if (raw.Note || raw.Information) await cooldown("alpha",86400);
    if (!Array.isArray(raw.holdings) || !raw.holdings.length) throw new Error("ETF constituent coverage is unavailable.");
    if (!raw.last_updated || !Number.isFinite(Date.parse(raw.last_updated))) throw new Error("ETF provider did not supply a verifiable holdings date.");
    const holdings: {ticker:string;name:string;weight:number}[] = [];
    const exclusions: {name:string;weight:number;kind:string}[] = [];
    for (const item of raw.holdings) {
      const ticker = String(item.symbol ?? "").trim().toUpperCase().replace(/[/-]/g,".");
      const name = String(item.description ?? ticker);
      const weight = Number(item.weight);
      if (!Number.isFinite(weight)) throw new Error("ETF contains an unresolved constituent weight.");
      const equitySymbol=/^[A-Z][A-Z.]{0,9}$/.test(ticker);
      // A company's name can contain "Option", "Cash", or "Trust". Never classify
      // a valid equity symbol as a derivative from its name alone.
      if ((!equitySymbol || ticker === "USD") && /\b(swaps?|futures?|options?|calls?|puts?|cash|treasury|bonds?)\b/i.test(name)) {
        exclusions.push({name,weight,kind:"non-equity"});
      } else if (equitySymbol && weight > 0) {
        if (/\bETF\b|\bfund\b/i.test(name)) throw new Error(`Nested fund ${name} requires verified constituent data.`);
        holdings.push({ticker,name,weight});
      } else throw new Error(`Unresolved ETF constituent: ${name}`);
    }
    const accounted = [...holdings,...exclusions].reduce((sum,h)=>sum+h.weight,0);
    if (Math.abs(accounted-1) > 0.01) throw new Error("ETF weights do not reconcile to full net assets; verified coverage is required.");
    return { holdings, sectors: (raw.sectors ?? []).map((s:{sector:string;weight:string})=>({sector:sectorFromGics(s.sector),weight:Number(s.weight)})), asOf:raw.last_updated, exclusions };
  });
}

async function resolve(row: ImportRow, previous: PositionResult, review=false): Promise<PositionResult> {
  if (row.excluded) return { state:"ready",attempts:0 };
  const problem = rowProblem(row);
  if (problem && !review) return {state:"needs_input",attempts:0,error:problem};
  if (review && !/^[A-Z][A-Z0-9.]{0,14}$/.test(row.ticker)) return {state:"needs_input",attempts:0,error:problem??"Confirm ticker"};
  const now = new Date().toISOString();
  if (row.kind === "cash") return problem ? {state:"needs_input",attempts:0,error:problem} : {state:"ready",attempts:0,input:{ticker:"USD",name:"USD cash",kind:"cash",shares:row.marketValue!,price:1},valuation:{price:1,source:"Confirmed USD balance",asOf:row.valuationDate,retrievedAt:now}};
  let valuation = previous.valuation;
  try {
    if (!valuation) {
      const q = await getQuote(row.ticker);
      if (q) valuation = {price:q.price,source:"Finnhub",asOf:new Date(q.time*1000).toISOString(),retrievedAt:q.retrievedAt??now};
      else if (!review && row.marketValue && row.valuationDate) valuation = {price:row.marketValue/row.shares!,source:"User-confirmed brokerage valuation",asOf:row.valuationDate,retrievedAt:now};
      else return {state:"needs_input",attempts:previous.attempts,error:"No quote found. Verify the ticker or provide a dated market value."};
      return {state:"pending",attempts:previous.attempts,valuation};
    }
    if (review) return {state:"pending",attempts:previous.attempts,valuation};
    const input: ApertureInput = {ticker:row.ticker,name:row.name || row.ticker,shares:row.shares!,price:valuation.price,kind:row.kind as "stock"|"etf"};
    const warnings:string[]=[];
    if (row.kind === "etf") input.etf = await fund(row.ticker);
    else {
      // The reviewed security type is authoritative. Optional company metadata
      // must not hold up an otherwise valued, confirmed stock position.
      const profile = await getProfile(row.ticker).catch(()=>null);
      if(profile){input.name=profile.name;input.industry=profile.industry;}
      else warnings.push("Company metadata unavailable; using the user-confirmed stock identity. Sector is unclassified.");
    }
    return {state:"ready",attempts:previous.attempts,valuation,input,warnings};
  } catch (error) {
    if (error instanceof QuotaWait) return {state:"pending",attempts:previous.attempts,valuation,retryAt:error.retryAt,error:error.message};
    const attempts = previous.attempts+1;
    if(!valuation && attempts>=4 && row.marketValue && row.shares && row.valuationDate && !review) return {state:"pending",attempts:0,valuation:{price:row.marketValue/row.shares,source:"User-confirmed brokerage valuation after provider failure",asOf:row.valuationDate,retrievedAt:now}};
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
    const settled=await Promise.all(batch.map(i=>resolve(job.rows[i],results[i],job.status==="review")));
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
