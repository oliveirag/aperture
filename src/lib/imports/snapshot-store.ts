"use client";
import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { usePortfolio, useHydratePortfolio } from "@/lib/portfolio-store";
import { mergeInputs, type Snapshot } from "./types";
type SnapshotState = {snapshot: Snapshot | null; hydrated: boolean};
export const useSnapshots = create<SnapshotState>()(persist((): SnapshotState => ({snapshot:null,hydrated:false}), {
 name:"aperture-import-snapshot",storage:createJSONStorage(()=>sessionStorage),skipHydration:true,
 partialize:s=>({snapshot:s.snapshot}),onRehydrateStorage:()=>()=>useSnapshots.setState({hydrated:true}),
}));
usePortfolio.subscribe((next, previous)=>{
 if(useSnapshots.getState().hydrated && (next.imported!==previous.imported || next.kind!==previous.kind)) useSnapshots.setState({snapshot:null});
});
export function snapshotActivationProblem(snapshot:Snapshot): string | null {
 const inputs=mergeInputs(snapshot.results);
 // Until the shared portfolio store supports explicit position values, fail closed
 // rather than show a different header/Shock/IC denominator from the saved X-Ray.
 if(inputs.some(h=>h.marketValue !== undefined && h.marketValue !== h.shares*h.price)) return "This snapshot retains unsupported/value-only exposure. Shared valuation display support is required before opening it; no position value was discarded.";
 const total=inputs.reduce((sum,h)=>sum+h.shares*h.price,0);
 if(Math.abs(total-snapshot.model.total)>Math.max(1,total)*1e-10) return "Snapshot valuation does not reconcile; refresh and review the portfolio.";
 return null;
}
export function activateSnapshot(snapshot:Snapshot) {
 const problem=snapshotActivationProblem(snapshot);
 if(problem)throw new Error(problem);
 const inputs=mergeInputs(snapshot.results);
 usePortfolio.getState().setImported(inputs.map(h=>({ticker:h.ticker,name:h.name,industry:h.industry??null,shares:h.shares,price:h.price})));
 useSnapshots.setState({snapshot});
}
export function useSnapshot() {
 useHydratePortfolio();
 const ready=usePortfolio(s=>s.hydrated);
 useEffect(()=>{if(ready && !useSnapshots.persist.hasHydrated())void useSnapshots.persist.rehydrate();},[ready]);
 return useSnapshots(s=>s.snapshot);
}
