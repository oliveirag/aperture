"use client";
import { importFetch } from "@/lib/imports/client";
import { useSnapshots, useSnapshot } from "@/lib/imports/snapshot-store";


import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase/browser";
import { create } from "zustand";
import { useHydratePortfolio, usePortfolio, type ImportedHolding } from "@/lib/portfolio-store";
import { DEMO_XRAY } from "@/lib/xray/demo";
import type { XrayModel } from "@/lib/xray/types";

const keyOf = (holdings: ImportedHolding[]) => JSON.stringify(holdings.map((h) => [h.ticker, h.shares]));

type Entry = { key: string; status: "loading" | "ready" | "error"; model: XrayModel | null; error: string | null };

// Last computed look-through, keyed by the imported holdings, so navigating back to X-Ray doesn't refetch.
const useLookthrough = create<{ entry: Entry | null; load: (holdings: ImportedHolding[], force?: boolean) => void }>()((set, get) => ({
  entry: null,
  load: (holdings, force = false) => {
    const key = keyOf(holdings);
    const current = get().entry;
    if (!force && current?.key === key && current.status !== "error") return;
    set({ entry: { key, status: "loading", model: null, error: null } });
    importFetch("/api/lookthrough", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdings: holdings.map(({ ticker, shares, price, name }) => ({ ticker, shares, price, name })) }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        if (get().entry?.key === key) set({ entry: { key, status: "ready", model: data as XrayModel, error: null } });
      })
      .catch((err: unknown) => {
        const error = err instanceof Error ? err.message : "Look-through failed";
        if (get().entry?.key === key) set({ entry: { key, status: "error", model: null, error } });
      });
  },
}));

export type XrayState =
  | { status: "ready"; model: XrayModel }
  | { status: "loading" }
  | { status: "error"; error: string; retry: () => void };

// The X-Ray for the active portfolio: curated canon for the demo, computed from real data for an imported one.
export function useXray(): XrayState {
  useHydratePortfolio();
  const hydrated = usePortfolio((s) => s.hydrated);
  const imported = usePortfolio((s) => s.imported);
  const snapshot = useSnapshot();
  const snapshotReady = useSnapshots(s=>s.hydrated);
  const [verified,setVerified]=useState<{id:string;model:XrayModel|null;error?:string}|null>(null);
  const [attempt,setAttempt]=useState(0);
  const entry = useLookthrough((s) => s.entry);
  const load = useLookthrough((s) => s.load);

  useEffect(() => {
    if (hydrated && snapshotReady && imported && !snapshot) load(imported);
  }, [hydrated, snapshotReady, imported, load, snapshot]);
  useEffect(()=>{
    if(!hydrated || !snapshot)return;
    const controller=new AbortController();
    importFetch(`/api/imports/snapshot?id=${encodeURIComponent(snapshot.id)}`,{cache:"no-store",signal:controller.signal}).then(async response=>{
      const data=await response.json();if(!response.ok)throw new Error(data.error);
      setVerified({id:snapshot.id,model:data.model});
    }).catch(e=>{if(!controller.signal.aborted)setVerified({id:snapshot.id,model:null,error:e.message});});
    const subscription=browserClient()?.auth.onAuthStateChange((event)=>{if(event==="SIGNED_OUT"){setVerified(null);usePortfolio.getState().resetToDemo();}});
    return()=>{controller.abort();subscription?.data.subscription.unsubscribe();};
  },[hydrated,snapshot,attempt]);

  if (!hydrated || !snapshotReady) return { status: "loading" };
  if (snapshot) {
    if(verified?.id!==snapshot.id)return {status:"loading"};
    if(verified.error)return {status:"error",error:verified.error,retry:()=>setAttempt(a=>a+1)};
    if(verified.model)return {status:"ready",model:verified.model};
    return {status:"loading"};
  }
  if (!imported) return { status: "ready", model: DEMO_XRAY };
  const mine = entry?.key === keyOf(imported) ? entry : null;
  if (mine?.status === "ready" && mine.model) return { status: "ready", model: mine.model };
  if (mine?.status === "error") return { status: "error", error: mine.error ?? "Look-through failed", retry: () => load(imported, true) };
  return { status: "loading" };
}
