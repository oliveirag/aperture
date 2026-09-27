"use client";
import { create } from "zustand";
import { HOLDINGS } from "@/data/portfolio";
import { MAX_POSITIONS, tooManyPositionsMessage } from "@/lib/limits";
import { usePortfolio } from "@/lib/portfolio-store";
import { portfolioKey, type ResearchResult } from "@/lib/shock/research-model";
import { useShock } from "./store";

export const useResearch = create<{ result: ResearchResult | null }>()(() => ({ result: null }));

export async function runResearch(question: string, signal?: AbortSignal): Promise<ResearchResult> {
  const imported = usePortfolio.getState().imported;
  if (imported && imported.length > MAX_POSITIONS) throw new Error(tooManyPositionsMessage(imported.length, "Scenario research"));
  const key = portfolioKey(imported ?? HOLDINGS);
  const response = await fetch("/api/shock/research", {
    method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({ question, holdings: imported, demo: !imported }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Scenario research failed");
  if (signal?.aborted || portfolioKey(usePortfolio.getState().imported ?? HOLDINGS) !== key) throw new Error("The portfolio changed. Run this scenario again for the current holdings.");
  const result = data as ResearchResult;
  useResearch.setState({ result });
  useShock.getState().setScenario("researched", result.result.scenario.baseSeverity);
  return result;
}
