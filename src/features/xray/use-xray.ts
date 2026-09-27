"use client";
import { importFetch } from "@/lib/imports/client";
import { useSnapshots, useSnapshot } from "@/lib/imports/snapshot-store";


import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase/browser";
import { create } from "zustand";
import { DEMO_HOLDINGS, useHydratePortfolio, usePortfolio, type ImportedHolding } from "@/lib/portfolio-store";
import { DEMO_XRAY } from "@/lib/xray/demo";
import type { XrayModel } from "@/lib/xray/types";

// Values, classification and source evidence are all part of a frozen portfolio.
const keyOf = (holdings: ImportedHolding[]) => JSON.stringify(holdings);

type Entry = { key: string; status: "loading" | "ready" | "error"; model: XrayModel | null; error: string | null };

// Last computed look-through, keyed by the imported holdings, so navigating back to X-Ray doesn't refetch.
const useAperture = create<{ entry: Entry | null; load: (holdings: ImportedHolding[], force?: boolean) => void }>()((set, get) => ({
  entry: null,
  load: (holdings, force = false) => {
    const key = keyOf(holdings);
    const current = get().entry;
    if (!force && current?.key === key && current.status !== "error") return;
    set({ entry: { key, status: "loading", model: null, error: null } });
    importFetch("/api/aperture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdings }),
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

// The X-Ray for the active portfolio, computed from live prices and ETF holdings. The demo portfolio goes through the
// same path; only if that fails does it fall back to its dated snapshot (DEMO_XRAY, labeled as such).
export function useXray(): XrayState {
  useHydratePortfolio();
  const hydrated = usePortfolio((s) => s.hydrated);
  const imported = usePortfolio((s) => s.imported);
  const snapshot = useSnapshot();
  const snapshotReady = useSnapshots(s=>s.hydrated);
  const [verified,setVerified]=useState<{id:string;model:XrayModel|null;error?:string}|null>(null);
  const [attempt,setAttempt]=useState(0);
  const entry = useAperture((s) => s.entry);
  const load = useAperture((s) => s.load);

  const holdings = imported ?? DEMO_HOLDINGS;
  useEffect(() => {
    if (hydrated && snapshotReady && !snapshot) load(holdings);
  }, [hydrated, snapshotReady, holdings, load, snapshot]);
  useEffect(()=>{
    if(!hydrated || !snapshot)return;
    const controller=new AbortController();
    importFetch(`/api/imports/snapshot?id=${encodeURIComponent(snapshot.id)}`,{cache:"no-store",signal:controller.signal}).then(async response=>{
      const data=await response.json();if(controller.signal.aborted)return;if(!response.ok)throw new Error(data.error);
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
  const mine = entry?.key === keyOf(holdings) ? entry : null;
  if (mine?.status === "ready" && mine.model) return { status: "ready", model: mine.model };
  if (mine?.status === "error") {
    if (!imported) return { status: "ready", model: DEMO_XRAY };
    return { status: "error", error: mine.error ?? "Look-through failed", retry: () => load(imported, true) };
  }
  return { status: "loading" };
}
