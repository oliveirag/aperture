// Synthetic USER INPUT examples, not provider responses. No network in fixture mode.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseReviewCsv } from "../src/features/import/csv";
import { readRows, rowProblem, mergeInputs } from "../src/lib/imports/types";
import { resolvePosition } from "../src/lib/imports/worker";
import { computeXray, type ApertureInput } from "../src/lib/xray/compute";
import { sectorFromIndustry, sectorFromGics, sectorFromSic } from "../src/lib/sectors";
import { reviewedValueInput } from "../src/lib/imports/valuation";
import { positionValue, repricePositions } from "../src/lib/xray/valuation";
import { assertProvenance } from "../src/lib/provenance";
import { parseRows } from "../src/lib/imports/ocr";
import { parseHoldings } from "../src/lib/xray/live";
import { sessionReviewProblem } from "../src/features/import/extract";
import { auditCsv } from "../src/lib/imports/csv";
assert.ok(auditCsv(readRows([{ticker:"=1+1",name:"@SUM(1,2)"}])).includes('"\'=1+1"'),"Exported user text must not execute as spreadsheet formula");

const duplicate = parseHoldings([{ticker:"AAPL",shares:2,price:100},{ticker:"AAPL",shares:3,price:200}]).get("AAPL")!;
assert.equal(duplicate.shares,5);
assert.equal(duplicate.price,160,"Duplicate snapshot valuations conserve both supplied values");
assert.ok(sessionReviewProblem(parseReviewCsv('Symbol,Quantity,Value\nCASH,,50').rows));

const ocr = parseRows('AAPL Apple 2 shares $150.00 $300.00\nCASH $50.00');
assert.equal(ocr.length,2,"OCR must preserve cash");
assert.equal(ocr[0].marketValue,null,"Two unlabelled dollar columns are ambiguous, not max(price,value)");
assert.equal(ocr[0].reviewState,"required");
assert.equal(ocr[0].ocrConfidence,undefined,"Never invent OCR confidence");
assert.equal(parseRows('CASH -$50.00')[0].marketValue,-50,"Negative cash must not become a positive asset");
assert.equal(parseRows('AAPL Apple 2 shares $300.00',72)[0].ocrConfidence,72);
assert.equal(parseRows('CASH $-50.00')[0].marketValue,-50);
assert.equal(parseRows('AAPL Apple -2 shares $300.00')[0].shares,-2,"Shorts must not turn into longs");

const unsupported = readRows([{ticker:"PRIVATE NOTE",name:"Synthetic private note",kind:"unsupported",shares:null,marketValue:400,valuationDate:"2025-01-01"}])[0];
assert.equal(rowProblem(unsupported),null);
assert.ok(rowProblem({...unsupported,shares:-2}),"Signed/short quantities require resolution, not an invalid ready valuation");
const reviewed = reviewedValueInput(unsupported,"2025-01-02T00:00:00.000Z");
assert.equal(reviewed.shares,0,"No invented share count for a value-only security");
assert.equal(positionValue(reviewed),400);
assertProvenance(reviewed.provenance);
assert.equal(reviewed.provenance?.kind,"retrieved");
assert.equal(reviewed.provenance && "endpoint" in reviewed.provenance,false,"Named reviewed input, not an invented URL");
assert.equal(computeXray([reviewed]).total,400);
assert.equal(computeXray([reviewed]).topTen.length,0);
assert.equal(computeXray([reviewed]).sectorSources?.[0].method,"Unsupported exposure retained in Other");
assert.equal(computeXray([reviewed]).sectorSources?.[0].status,"source-unavailable");
const repriced=repricePositions([reviewed,{ticker:"AAPL",name:"Apple",kind:"stock" as const,shares:2,price:100}],new Map([[reviewed.ticker,999],["AAPL",150]]));
assert.equal(positionValue(repriced[0]),400);
assert.equal(repriced[1].shares,2);
assert.equal(positionValue(repriced[1]),300);
assert.equal(computeXray(repriced).valuation?.total,700);
const combinedUnsupported=mergeInputs([{state:"ready",attempts:0,input:reviewed},{state:"ready",attempts:0,input:reviewed}]);
assert.equal(positionValue(combinedUnsupported[0]),800);
assert.equal(combinedUnsupported[0].shares,0);
assert.equal(computeXray(mergeInputs(Array.from({length:100},()=>({state:"ready" as const,attempts:0,input:reviewed})))).total,40000,"Many accounts must not overflow provenance nesting");
assert.equal(readRows([{...unsupported,reviewState:"confirmed"}])[0].reviewState,"required");
async function checkReviewGate() {
  const pending={state:"pending" as const,attempts:0};
  assert.equal((await resolvePosition(unsupported,pending,true,"2025-01-02T00:00:00Z")).input,undefined);
  assert.equal((await resolvePosition(unsupported,pending,false)).state,"needs_input");
  const ready=await resolvePosition(unsupported,pending,false,"2025-01-02T00:00:00Z");
  assert.equal(ready.state,"ready");
  assert.equal(positionValue(ready.input!),400);
  console.log("Reviewed worker checks OK: no provider request for unsupported value; confirmation timestamp mandatory.");
}
void checkReviewGate().catch(error=>{console.error(error);process.exitCode=1;});

const fixture = JSON.parse(readFileSync(new URL("./fixtures/import-layouts.json",import.meta.url),"utf8")) as {kind:string;examples:[string,string][]};
assert.equal(fixture.kind,"synthetic-user-input");
const examples=fixture.examples;
assert.equal(examples.length,5);
for (const [broker, csv] of examples) {
  const result = parseReviewCsv(csv);
  assert.equal(result.error, null, broker);
  assert.equal(result.rows.length, 2, broker);
  assert.deepEqual(result.rows.map(r => r.marketValue), [300, 50], `${broker}: quantities are not dollars`);
  assert.equal(result.rows[0].shares, 2, broker);
}
const activity=parseReviewCsv('Activity Date,Instrument,Trans Code,Quantity,Price,Amount\n2025-01-01,AAPL,Buy,2,$100,$200');
assert.equal(activity.rows[0].rowType,"unresolved","Robinhood activity is not a current-positions statement");
assert.equal(activity.rows[0].marketValue,null,"Trade amount is not portfolio market value");
assert.ok(sessionReviewProblem(activity.rows));
const foreign = readRows(parseReviewCsv('Symbol,Quantity,Market Value,Currency\nSAP,2,300,EUR').rows)[0];
assert.equal(foreign.currency, "EUR");
assert.match(rowProblem({ ...foreign, kind: "stock", valuationDate: "2025-01-01" }) ?? "", /currency|USD/i);
const total = parseReviewCsv('Symbol,Quantity,Market Value\nAAPL,2,300\nAccount Total,,300').rows[1];
assert.equal(total.rowType, "total");
assert.ok(rowProblem(readRows([{ ...total, kind: "cash", valuationDate: "2025-01-01" }])[0]));
assert.equal(readRows([{ticker:"BRK/B"}])[0].ticker,"BRK.B");
assert.ok(rowProblem(readRows([{ticker:"AAPL",kind:"stock",shares:1,marketValue:10,valuationDate:"2025-02-30"}])[0]));
assert.equal(sectorFromGics("Technology"), "Technology");
assert.equal(sectorFromIndustry("Gas Utilities"), "Utilities");
assert.equal(sectorFromIndustry("Restaurants"), "Consumer Discretionary");
assert.equal(sectorFromSic(3674),"Technology");
assert.equal(sectorFromSic(6021),"Financials");
assert.equal(sectorFromSic(9999),"Other");

const close = (a:number,b:number) => assert.ok(Math.abs(a-b) <= Math.max(1,Math.abs(b))*1e-10, `${a} != ${b}`);
// Deterministic generated mathematical inputs, not fabricated provider fixtures.
for (let seed=1;seed<=100;seed++) {
  const h = (ticker:string,weight:number) => ({ticker,name:ticker,weight});
  const positions:ApertureInput[] = [
    {ticker:"AAPL",name:"Apple",shares:seed,price:3,kind:"stock",industry:"Technology"},
    {ticker:"FUNDONE",name:"Mathematical basket one",shares:seed+1,price:7,kind:"etf",etf:{asOf:"2025-01-01",holdings:[h("AAPL",0.2),h("AAPL",0.1),h("MSFT",0.4)],sectors:[{sector:"Technology",weight:0.9999}]}},
    {ticker:"FUNDTWO",name:"Mathematical basket two",shares:seed+2,price:11,kind:"etf",etf:{asOf:"2025-01-01",holdings:[h("AAPL",0.25),h("MSFT",0.3)],sectors:[]}},
    {ticker:"USD",name:"Cash",shares:seed,price:1,kind:"cash"},
  ];
  const before=JSON.stringify(positions);
  const model=computeXray(positions);
  close(model.total,positions.reduce((s,p)=>s+p.shares*p.price,0));
  close(model.map.positions.reduce((s,p)=>s+p.weight,0),1);
  close(model.sectors.reduce((s,p)=>s+p.weight,0),1);
  close(model.map.exposures.reduce((s,p)=>s+p.value,0),model.total);
  close(model.overlaps[0].overlap,0.55);
  close(computeXray([...positions].reverse()).overlaps[0].overlap,model.overlaps[0].overlap);
  assert.equal(JSON.stringify(positions),before);
  const prices=new Map(positions.map(p=>[p.ticker,p.price*1.1]));
  const repriced=repricePositions(positions,prices);
  assert.deepEqual(repriced.map(p=>p.shares),positions.map(p=>p.shares));
  assert.equal(repriced.find(p=>p.ticker==="USD")!.price,1);
  close(computeXray(repriced).total,repriced.reduce((sum,p)=>sum+positionValue(p),0));
  assert.equal(computeXray(positions).sources.some(s=>s.issuer==="Alpha Vantage"),false,"Do not invent the holdings provider");
}
const smallResidual=computeXray([{ticker:"F",name:"F",shares:1,price:100,kind:"etf",etf:{asOf:"2025-01-01",holdings:[],sectors:[{sector:"Technology",weight:0.9999}]}}]);
close(smallResidual.sectors.reduce((s,p)=>s+p.weight,0),1);
const tiny=computeXray([{ticker:"AAPL",name:"Apple",shares:1,price:0.01,kind:"stock"},{ticker:"USD",name:"Cash",shares:100,price:1,kind:"cash"}]);
close(tiny.map.connectors.reduce((sum,c)=>sum+c.value,0),tiny.total);
assert.throws(()=>computeXray([{ticker:"BAD",name:"Bad",shares:1,price:100,kind:"etf",etf:{asOf:"2025-01-01",holdings:[{ticker:"AAPL",name:"Apple",weight:1.2}],sectors:[]}}]),/weight/i);
assert.throws(()=>computeXray([{ticker:"BAD",name:"Bad",shares:1,price:NaN,kind:"stock"}]),/valu|finite/i);
assert.throws(()=>computeXray([{ticker:"BAD",name:"Unpriced",shares:1,price:0,kind:"stock"}]),/valu|price/i);
assert.throws(()=>computeXray([{ticker:"BAD",name:"Bad evidence",shares:1,price:1,kind:"stock",provenance:{kind:"computed",formula:"missing inputs",inputs:[]}}]),/provenance/i);
console.log("Import invariants OK: five synthetic CSV layouts; currency/totals review; 100 conservation/weight/overlap properties; sector residual and immutable quantities.");
