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
export function activateSnapshot(snapshot:Snapshot) {
 usePortfolio.getState().setImported(mergeInputs(snapshot.results).map(h=>({ticker:h.ticker,name:h.name,industry:h.industry??null,shares:h.shares,price:h.price})));
 useSnapshots.setState({snapshot});
}
export function useSnapshot() {
 useHydratePortfolio();
 const ready=usePortfolio(s=>s.hydrated);
 useEffect(()=>{if(ready && !useSnapshots.persist.hasHydrated())void useSnapshots.persist.rehydrate();},[ready]);
 return useSnapshots(s=>s.snapshot);
}
