"use client";

import { create } from "zustand";
import type { Level } from "@/lib/level";
import { runResearch } from "@/features/shock/research-store";
import { isScenarioQuestion } from "@/lib/shock/research-model";

export type AskMessage = { id: number; role: "user" | "assistant"; text: string; scenario?: boolean; declined?: boolean; error?: boolean; pending?: boolean };

type AskState = {
  open: boolean;
  messages: AskMessage[];
  busy: boolean;
  setOpen: (open: boolean) => void;
  ask: (question: string, level: Level, context: unknown) => Promise<void>;
  stop: () => void;
  clear: () => void;
};

let nextId = 1;
let controller: AbortController | null = null;

// The Ask conversation for this tab. Answers stream into the last assistant message.
export const useAsk = create<AskState>()((set, get) => ({
  open: false,
  messages: [],
  busy: false,
  setOpen: (open) => set({ open }),
  stop: () => controller?.abort(),
  clear: () => {
    controller?.abort();
    set({ messages: [], busy: false });
  },
  ask: async (question, level, pageContext) => {
    let context = pageContext;
    if (get().busy || !question.trim()) return;
    const history = get()
      .messages.filter((m) => !m.error && !m.pending)
      .map((m) => ({ role: m.role, text: m.text }));
    const answerId = nextId + 1;
    set((s) => ({
      busy: true,
      messages: [...s.messages, { id: nextId++, role: "user", text: question.trim() }, { id: nextId++, role: "assistant", text: "", pending: true }],
    }));
    const patch = (fn: (m: AskMessage) => AskMessage) => set((s) => ({ messages: s.messages.map((m) => (m.id === answerId ? fn(m) : m)) }));
    controller = new AbortController();
    // Scenario questions run the deterministic shock model first, then the model reasons over its output.
    let fallback = "";
    try {
      if (isScenarioQuestion(question)) {
        const result = await runResearch(question, controller.signal);
        const s = result.result.scenario;
        fallback = `${result.assumption}\n\n${result.evidenceMode === "web" ? "Web sources and their supported claims" : result.evidenceMode === "filing" ? "Passages from the companies' own 10-K filings" : "Reference sources (no live web search)"} are shown with the graph. Open it to inspect the propagation, adjust the magnitude, and see the calculated effects on your holdings.`;
        context = {
          portfolio: context,
          scenario: {
            question: result.question,
            assumption: result.assumption,
            driver: result.plan.driver,
            basis: result.plan.basis,
            rationale: result.plan.rationale,
            severityPct: s.baseSeverity,
            magnitudeStated: result.plan.magnitudeStated,
            evidenceMode: result.evidenceMode,
            evidence: result.evidence,
            sensitivities: result.sensitivities,
            impacts: s.impacts.slice(0, 40).map((i) => ({ ticker: i.ticker, returnFraction: i.baseReturn, dollar: i.baseDollar, path: i.pathLabel })),
            modeledShare: result.result.modeledShare,
            notModeled: result.result.notModeled,
          },
        };
        patch((m) => ({ ...m, scenario: true }));
      }
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim(), level, context, history }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Ask failed (HTTP ${res.status})`);
      }
      const declined = res.headers.get("X-Ask-Declined") === "1";
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        patch((m) => ({ ...m, text: m.text + value, declined }));
      }
      patch((m) => ({ ...m, pending: false, declined }));
    } catch (err) {
      const aborted = controller?.signal.aborted;
      patch((m) => ({
        ...m,
        pending: false,
        error: !aborted && !fallback,
        text: aborted ? m.text || "Stopped." : fallback || (err instanceof Error ? err.message : "Ask failed"),
      }));
    } finally {
      controller = null;
      set({ busy: false });
    }
  },
}));
