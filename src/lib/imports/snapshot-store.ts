"use client";
import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { usePortfolio, useHydratePortfolio } from "@/lib/portfolio-store";
import { mergeInputs, type Snapshot } from "./types";
import { portfolioValue } from "@/lib/xray/valuation";
type SnapshotState = {snapshot: Snapshot | null; hydrated: boolean};
export const useSnapshots = create<SnapshotState>()(persist((): SnapshotState => ({snapshot:null,hydrated:false}), {
 name:"aperture-import-snapshot",storage:createJSONStorage(()=>sessionStorage),skipHydration:true,
 partialize:s=>({snapshot:s.snapshot}),onRehydrateStorage:()=>()=>useSnapshots.setState({hydrated:true}),
}));
usePortfolio.subscribe((next, previous)=>{
 if(useSnapshots.getState().hydrated && (next.imported!==previous.imported || next.kind!==previous.kind)) useSnapshots.setState({snapshot:null});
});
export function snapshotActivationProblem(snapshot:Snapshot): string | null {
 let total: number;
 try { total=portfolioValue(mergeInputs(snapshot.results)); }
 catch { return "Snapshot contains an invalid valuation; refresh and review the portfolio."; }
 if(!Number.isFinite(snapshot.model.total) || Math.abs(total-snapshot.model.total)>Math.max(1,total)*1e-10) return "Snapshot valuation does not reconcile; refresh and review the portfolio.";
 return null;
}
export function activateSnapshot(snapshot:Snapshot) {
 const problem=snapshotActivationProblem(snapshot);
 if(problem)throw new Error(problem);
 const inputs=mergeInputs(snapshot.results);
 usePortfolio.getState().setImported(inputs.map(h=>({...h,industry:h.industry??null})));
 useSnapshots.setState({snapshot});
}
export function useSnapshot() {
 useHydratePortfolio();
 const ready=usePortfolio(s=>s.hydrated);
 useEffect(()=>{if(ready && !useSnapshots.persist.hasHydrated())void useSnapshots.persist.rehydrate();},[ready]);
 return useSnapshots(s=>s.snapshot);
}
