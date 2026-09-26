import assert from "node:assert/strict";

async function main() {
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
  const savedSnapshot = storage.getItem("lookthrough-import-snapshot")!;
  useSnapshots.setState({snapshot:null,hydrated:false});
  storage.setItem("lookthrough-import-snapshot",savedSnapshot);
  await usePortfolio.persist.rehydrate();
  await useSnapshots.persist.rehydrate();
  assert.equal(useSnapshots.getState().snapshot?.id,snapshot.id);
  usePortfolio.getState().resetToDemo();
  assert.equal(useSnapshots.getState().snapshot,null);
  activateSnapshot(snapshot);
  usePortfolio.getState().setImported([{ticker:"MSFT",name:"Microsoft",shares:1,price:200,industry:null}],"practice");
  assert.equal(useSnapshots.getState().snapshot,null);
  console.log("Snapshot selection checks passed: activation, refresh, demo and practice transitions.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
