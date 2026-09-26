"use client";

import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import { ShockImpact } from "./impact";
import { ShockModelContext } from "./model-context";
import { ShockStage } from "./stage";
import { useShockModel } from "./use-shock-model";

// The Shock Test for the active portfolio: curated scenarios for the demo, the same scenarios mapped onto your
// look-through exposures for an imported or practice portfolio.
export function ShockTest() {
  const state = useShockModel();
  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-8" aria-busy="true">
        <p className="eyebrow">Shock Test</p>
        <p className="flex items-center gap-3 text-[18px] font-light text-text-muted">
          <LoaderCircle aria-hidden className="size-5 animate-spin text-accent" />
          Mapping the scenarios onto your holdings…
        </p>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="flex flex-col gap-6">
        <p className="eyebrow">Shock Test</p>
        <p className="flex items-start gap-3 text-[18px] font-light text-text">
          <AlertTriangle aria-hidden className="mt-1 size-5 shrink-0 text-sev-medium" />
          Couldn&apos;t map the scenarios onto your portfolio ({state.error}).
        </p>
        <button
          type="button"
          onClick={state.retry}
          className="inline-flex h-10 w-fit items-center gap-2 bg-text px-4 text-[14px] font-medium text-bg transition-[background-color,transform,translate,scale] duration-150 ease-out hover:bg-text/85 active:scale-[0.97]"
        >
          <RotateCcw aria-hidden className="size-4" />
          Try again
        </button>
      </div>
    );
  }
  return (
    <ShockModelContext value={state.model}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <ShockStage />
        <ShockImpact />
      </div>
    </ShockModelContext>
  );
}
