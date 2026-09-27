import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

async function main() {
  process.env.APERTURE_CACHE_DIR = await mkdtemp(path.join(tmpdir(),"aperture-selection-"));
  globalThis.fetch = async () => { throw new Error("Selection regression must not access the network"); };
  const values = new Map<string,string>();
  const storage = {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};
  Object.defineProperty(globalThis,"sessionStorage",{value:storage,configurable:true});
  const {usePortfolio} = await import("../src/lib/portfolio-store");
  const {activateSnapshot,useSnapshots} = await import("../src/lib/imports/snapshot-store");
  const {computeXray} = await import("../src/lib/xray/compute");
  const input = {ticker:"AAPL",name:"Apple",shares:2,price:100,kind:"stock" as const};
  const snapshot = {id:"snapshot-1",portfolio_id:"portfolio-1",created_at:new Date().toISOString(),model:computeXray([input]),rows:[],results:[{state:"ready" as const,attempts:0,input}]};
  await usePortfolio.persist.rehydrate();
  await useSnapshots.persist.rehydrate();
  activateSnapshot(snapshot);
  assert.equal(usePortfolio.getState().imported?.[0].shares,2);
  assert.equal(useSnapshots.getState().snapshot?.id,snapshot.id);
  // Simulate a refresh: hydrate legacy selection before the independent snapshot.
  const savedSnapshot = storage.getItem("aperture-import-snapshot")!;
  useSnapshots.setState({snapshot:null,hydrated:false});
  storage.setItem("aperture-import-snapshot",savedSnapshot);
  await usePortfolio.persist.rehydrate();
  await useSnapshots.persist.rehydrate();
  assert.equal(useSnapshots.getState().snapshot?.id,snapshot.id);
  usePortfolio.getState().resetToDemo();
  assert.equal(useSnapshots.getState().snapshot,null);
  activateSnapshot(snapshot);
  usePortfolio.getState().setImported([{ticker:"MSFT",name:"Microsoft",shares:1,price:200,industry:null}],"practice");
  assert.equal(useSnapshots.getState().snapshot,null);
  const {portfolioHoldings} = await import("../src/lib/portfolio-store");
  const {priceHoldings} = await import("../src/lib/market");
  const {positionValue, repricePositions} = await import("../src/lib/xray/valuation");
  const {parseHoldings, apertureInputs, modelFor} = await import("../src/lib/xray/live");
  const {buildPerformance} = await import("../src/lib/performance");
  const {performancePositions} = await import("../src/features/xray/details/live-performance");
  const {SnapshotHistory} = await import("../src/features/import/snapshot-history");
  const React = await import("react");
  Object.assign(globalThis,{React});
  const {renderToStaticMarkup} = await import("react-dom/server");
  const {withPosition, exposureValue} = await import("../src/lib/ic/fit");
  const mixed = [input,
    {ticker:"PRIVATE NOTE",name:"Reviewed note",shares:0,price:0,marketValue:400,kind:"opaque" as const},
    {ticker:"USD",name:"Cash",shares:50,price:1,kind:"cash" as const},
    {ticker:"VALUEONLY",name:"Reviewed value-only equity",shares:0,price:0,marketValue:150,kind:"stock" as const},
  ];
  const mixedSnapshot = {...snapshot,id:"mixed",model:computeXray(mixed),results:mixed.map(input=>({state:"ready" as const,attempts:0,input}))};
  assert.doesNotThrow(()=>activateSnapshot(mixedSnapshot),"Reviewed unsupported/cash/value-only snapshot must open, not fail closed");
  assert.equal(mixedSnapshot.model.total,800);
  const html = renderToStaticMarkup(React.createElement(SnapshotHistory,{snapshots:[mixedSnapshot],busy:false,onOpen:()=>{},onRefresh:()=>{}}));
  assert.match(html,/PRIVATE NOTE<\/td><td[^>]*>\$400/,"History row displays the real unsupported value");
  assert.ok(!html.includes("Explicitly excluded during review"),"Valued cash/unsupported rows are not mislabeled excluded");
  assert.deepEqual(usePortfolio.getState().imported?.map(positionValue),[200,400,50,150]);
  const savedMixed = storage.getItem("aperture-import-snapshot")!;
  useSnapshots.setState({snapshot:null,hydrated:false});
  storage.setItem("aperture-import-snapshot",savedMixed);
  await usePortfolio.persist.rehydrate();
  await useSnapshots.persist.rehydrate();
  assert.equal(useSnapshots.getState().snapshot?.model.total,800,"Reload retains the selected model and denominator");
  const display = portfolioHoldings(usePortfolio.getState().imported);
  assert.equal(display.reduce((sum,h)=>sum+h.value,0),800,"Header equals X-Ray");
  const quotes = Object.fromEntries(mixed.map(p=>[p.ticker,{price:150,change:50,changePct:0.5,prevClose:100,time:Date.now()/1000}]));
  const priced = priceHoldings(quotes,display);
  assert.equal(priced.total,900,"Only the quoted stock may reprice; unsupported/cash/value-only values remain authoritative");
  assert.equal(priced.holdings.find(p=>p.ticker==="PRIVATE NOTE")?.value,400);
  assert.equal(priced.holdings.find(p=>p.ticker==="USD")?.value,50);
  assert.equal(priced.holdings.find(p=>p.ticker==="VALUEONLY")?.value,150);
  assert.deepEqual(priced.holdings.map(p=>p.shares),display.map(p=>p.shares),"Never manufacture quantities");
  const refreshed = repricePositions(mixed,new Map([["AAPL",150],["USD",999],["PRIVATE NOTE",999],["VALUEONLY",999]]));
  activateSnapshot({...mixedSnapshot,id:"refreshed",model:computeXray(refreshed),results:refreshed.map(input=>({state:"ready" as const,attempts:0,input}))});
  assert.equal(portfolioHoldings(usePortfolio.getState().imported).reduce((s,p)=>s+p.value,0),900);
  const parsed = parseHoldings(JSON.parse(JSON.stringify(usePortfolio.getState().imported)));
  assert.equal(parsed.size,4,"Reanalysis must not drop zero-quantity or unsupported identifiers");
  const rebuilt = await apertureInputs(parsed);
  assert.equal((await modelFor(rebuilt))?.total,900);
  assert.equal((await modelFor([mixed[1]]))?.total,400,"Unsupported-only X-Ray is a real valued model");
  const cashOnly = {...mixed[2],shares:0,price:0,marketValue:50};
  assert.equal((await modelFor(await apertureInputs(parseHoldings([cashOnly]))))?.total,50,"Value-only cash opens a consistent X-Ray");
  assert.equal((await modelFor([{...cashOnly,marketValue:0}]))?.total,0,"A reviewed zero balance is valid, not an unavailable-price placeholder");
  const history = [{date:"2025-01-01",close:90},{date:"2025-01-08",close:100}];
  const payload = performancePositions(display);
  assert.equal(payload.find(p=>p.ticker==="PRIVATE NOTE")?.marketValue,400,"Performance request retains explicit values");
  assert.equal(payload.find(p=>p.ticker==="USD")?.kind,"cash","Performance request retains exclusions");
  const performance = buildPerformance(payload,Object.fromEntries(mixed.map(p=>[p.ticker,history])),"2025-01-09");
  assert.equal(performance.coverage,200/800);
  assert.deepEqual([...performance.excluded].sort(),["PRIVATE NOTE","USD","VALUEONLY"].sort());
  assert.equal(exposureValue(mixed,"VALUEONLY"),150,"IC uses actual value, not a fabricated share count");
  assert.equal(computeXray(withPosition(mixed,{...mixed[3],marketValue:25})).total,825,"IC adds value-only candidate dollars");
  assert.equal(computeXray(withPosition(mixed,{...mixed[1],marketValue:25})).total,825,"IC retains existing unsupported value");
  // Exercise the actual HTTP boundary, not only buildPerformance's pure math.
  const {POST} = await import("../src/app/api/performance/route");
  const request = (holdings: unknown) => new Request("http://localhost/api/performance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({holdings})});
  const response = await POST(request(payload));
  assert.equal(response.status,200,"Missing history is a terminal unavailable series, not a lost portfolio");
  const body = await response.json();
  assert.deepEqual([...body.excluded].sort(),mixed.map(p=>p.ticker).sort());
  assert.equal(body.unmodeled.reduce((sum:number,p:{marketValue:number})=>sum+p.marketValue,0),800);
  assert.equal(body.historySources.USD.status,"unsupported");
  assert.equal(body.historySources["PRIVATE NOTE"].status,"unsupported");
  assert.equal((await POST(request([{...payload[0],marketValue:-1}]))).status,400);
  // Seed an INTERNAL mathematical history (not a fabricated provider response)
  // in this test's isolated cache, and execute the real route/parser/calculator.
  const {put} = await import("../src/lib/cache");
  const internalHistory = {symbol:"AAPL",status:"available",daily:[],weekly:history,stale:false,
    adjustment:{status:"unverified",suspiciousDates:[],reason:"Internal mathematical fixture; no total-return claim"},
    crossValidation:{status:"not-comparable",primary:"none",secondary:"none",selected:"none",reason:"Internal fixture"},numericProvenance:{}};
  put("history:sourced:AAPL",internalHistory,60_000);
  put("prices:history:v2:AAPL",internalHistory,60_000); // ws/a's sourced adapter after merge
  process.env.ALPHA_VANTAGE_API_KEY="fixture-only-no-network";
  const modeled = await (await POST(request(payload))).json();
  assert.equal(modeled.coverage,200/800,"HTTP coverage keeps every reviewed dollar");
  assert.equal(modeled.series.at(-1).value,200);
  assert.equal(modeled.unmodeled.reduce((sum:number,p:{marketValue:number})=>sum+p.marketValue,0),600);
  const {assertNumericProvenance} = await import("../src/lib/provenance");
  const {provenance: modeledEvidence,...modeledData}=modeled;
  assertNumericProvenance(modeledData,modeledEvidence);
  const opaqueTicker = await (await POST(request([{...payload.find(p=>p.ticker==="AAPL"),kind:"opaque",marketValue:500}]))).json();
  assert.equal(opaqueTicker.historySources.AAPL.status,"unsupported","Even a real equity ticker must not fetch history when reviewed as opaque");
  assert.deepEqual(opaqueTicker.series,[]);
  delete process.env.ALPHA_VANTAGE_API_KEY;
  const {runIdFor} = await import("../src/lib/ic/run");
  const runInput = {ticker:"MSFT",thesis:"Test valuation identity",amount:100,holdings:parseHoldings(mixed)};
  const id = runIdFor(runInput);
  for (const patch of [{price:101},{marketValue:201},{kind:"opaque"},{provenance:{kind:"assumption",source:"Review",rationale:"Updated source"}}]) {
    assert.notEqual(runIdFor({...runInput,holdings:parseHoldings([{...mixed[0],...patch},...mixed.slice(1)])}),id,"IC memo/fit identity must change with valuation, classification or provenance");
  }
  const evidence = {kind:"assumption" as const,source:"Reviewed test input",rationale:"Internal integration fixture, not provider data"};
  assert.deepEqual(performancePositions([{...mixed[0],provenance:evidence}])[0].provenance,evidence);
  // SSR uses Zustand's initial snapshot, not client mutations. The interactive
  // empty-position/async-race assertions live in check-import-react.ts.
  console.log("Snapshot selection checks passed: mixed-value activation, reload, HTTP performance exclusions, IC valuation identity, numeric provenance, and denominator conservation.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
