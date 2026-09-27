// Live checks are read-only provider access; never connect to any database.
// Replay mode reads a captured real Finnhub response, never a synthetic provider shape.
import assert from "node:assert/strict";
import path from "node:path";
import { loadFixture, saveFixture, withLiveLock, type Fixture } from "./lib/fixtures";
import { computeXray } from "../src/lib/xray/compute";
import { reviewedValueInput } from "../src/lib/imports/valuation";
import { readRows } from "../src/lib/imports/types";
import { repricePositions } from "../src/lib/xray/valuation";
import { assertProvenance } from "../src/lib/provenance";

const filename=path.join(process.cwd(),"scripts/fixtures/finnhub/import-aapl-quote.json");
function check(fixture:Fixture) {
  assert.equal(fixture.provider,"finnhub");
  assert.equal(fixture.endpoint,"https://finnhub.io/api/v1/quote?symbol=AAPL");
  const raw=JSON.parse(fixture.body);
  assert.ok(Number.isFinite(raw.c)&&raw.c>0&&Number.isFinite(raw.t)&&raw.t>0,"Real provider quote unavailable");
  const asOf=new Date(raw.t*1000).toISOString();
  const provenance={kind:"retrieved" as const,provider:"finnhub" as const,endpoint:fixture.endpoint,retrievedAt:fixture.retrievedAt,asOf};
  assertProvenance(provenance);
  // User quantities are synthetic test inputs, explicitly not provider facts.
  const input=reviewedValueInput(readRows([{ticker:"AAPL",name:"Synthetic user-input Apple position",kind:"stock",shares:2,marketValue:2*raw.c,valuationDate:asOf.slice(0,10)}])[0],fixture.retrievedAt);
  input.provenance={kind:"computed",formula:"synthetic reviewed quantity × real Finnhub unit price",inputs:[input.provenance!,provenance]};
  const cash=reviewedValueInput(readRows([{ticker:"USD",name:"Synthetic user-input cash",kind:"cash",shares:null,marketValue:50,valuationDate:asOf.slice(0,10)}])[0],fixture.retrievedAt);
  const model=computeXray([input,cash]);
  assert.equal(model.total,2*raw.c+50);
  assert.equal(model.valuation?.total,model.total);
  assert.equal(repricePositions([input],new Map([["AAPL",raw.c]]))[0].shares,2);
  console.log(JSON.stringify({provider:fixture.provider,symbol:"AAPL",price:raw.c,asOf,retrievedAt:fixture.retrievedAt,portfolioValue:model.total,quantity:2,cash:50,quantitySource:"synthetic reviewed user-input test",mode:process.argv.includes("--live")?"live":"real-fixture-replay"}));
}
async function main() {
  if(!process.argv.includes("--live")){check(await loadFixture(filename));return;}
  for(const name of ["SUPABASE_SERVICE_ROLE_KEY","NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY","UPSTASH_REDIS_REST_URL","UPSTASH_REDIS_REST_TOKEN","KV_REST_API_URL","KV_REST_API_TOKEN","GEMINI_API_KEY","GEMINI_API_KEYS"]) assert.equal(process.env[name],"",`${name} must be explicitly blank`);
  assert.equal(process.env.APERTURE_CACHE_DIR,"/Users/zakariakhan/.cache/aperture-shared");
  await withLiveLock(async()=>{
    const key=process.env.FINNHUB_API_KEY;
    assert.ok(key,"Finnhub key is required");
    const endpoint="https://finnhub.io/api/v1/quote?symbol=AAPL";
    let response:Response;
    try{response=await fetch(endpoint,{headers:{"X-Finnhub-Token":key},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000)});}catch{throw new Error("Finnhub live import check request failed");}
    assert.equal(response.status,200,`Finnhub HTTP ${response.status}`);
    const fixture=await saveFixture(filename,{provider:"finnhub",endpoint,retrievedAt:new Date().toISOString(),body:await response.text()});
    check(fixture);
  },{waitMs:0});
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Import live check failed");process.exitCode=1;});
