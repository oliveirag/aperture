import type { Provider } from "../../src/lib/provenance";

export type WarmJob = { provider: Provider; run?: () => Promise<{ detail: string; asOf?: string }>; disabledReason?: string };
export type WarmResult = { provider: Provider; status: "PASS" | "FAIL" | "SKIP"; checkedAt: string; detail: string; asOf?: string };
// Sequential so warming never bursts providers. run() owns validation, timeouts and provider throttling.
export async function warmProviders(jobs: readonly WarmJob[]): Promise<WarmResult[]> {
  const results: WarmResult[] = [];
  for (const job of jobs) {
    if (!job.run || job.disabledReason) {
      results.push({ provider: job.provider, status: "SKIP", checkedAt: new Date().toISOString(), detail: job.disabledReason ?? "Adapter not integrated" });
      continue;
    }
    try {
      const evidence = await job.run();
      if (!evidence.detail.trim()) throw new Error("Missing evidence");
      results.push({ provider: job.provider, status: "PASS", checkedAt: new Date().toISOString(), ...evidence });
    } catch {
      // Provider errors can embed credentials; only a fixed diagnostic leaves this boundary.
      results.push({ provider: job.provider, status: "FAIL", checkedAt: new Date().toISOString(), detail: "Provider unavailable, empty, stale, or invalid; not warmed" });
    }
  }
  return results;
}
