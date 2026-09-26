"use client";

import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import { usePortfolio } from "@/lib/portfolio-store";
import { XrayDetails } from "./details";
import { XrayHero } from "./hero";
import { useXray } from "./use-xray";

function Loading() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true">
      <p className="eyebrow">X-Ray</p>
      <p className="flex items-center gap-3 text-[18px] font-light text-text-muted">
        <LoaderCircle aria-hidden className="size-5 animate-spin text-accent" />
        Looking through your ETFs to the companies inside…
      </p>
      <div className="h-[420px] animate-pulse bg-surface-1" />
    </div>
  );
}

function Failed({ error, retry }: { error: string; retry: () => void }) {
  const resetToDemo = usePortfolio((s) => s.resetToDemo);
  return (
    <div className="flex flex-col gap-6">
      <p className="eyebrow">X-Ray</p>
      <p className="flex items-start gap-3 text-[18px] font-light text-text">
        <AlertTriangle aria-hidden className="mt-1 size-5 shrink-0 text-sev-medium" />
        Couldn&apos;t build the look-through for your portfolio ({error}).
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={retry}
          className="inline-flex h-10 items-center gap-2 bg-text px-4 text-[14px] font-medium text-bg transition-[background-color,transform] duration-150 ease-out hover:bg-text/85 active:scale-[0.97]"
        >
          <RotateCcw aria-hidden className="size-4" />
          Try again
        </button>
        <button
          type="button"
          onClick={resetToDemo}
          className="inline-flex h-10 items-center border border-border-strong px-4 text-[14px] font-medium text-text transition-[background-color,transform] duration-150 ease-out hover:bg-surface-1 active:scale-[0.97]"
        >
          Switch to demo
        </button>
      </div>
    </div>
  );
}

// X-Ray for the active portfolio. The map remounts per model so its reveal replays for new data.
export function XrayView() {
  const state = useXray();
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <Failed error={state.error} retry={state.retry} />;
  const { model } = state;
  const key = `${model.mode}-${model.total}`;
  return (
    <div className="flex flex-col gap-10">
      <XrayHero key={key} model={model} />
      <XrayDetails model={model} />
    </div>
  );
}
