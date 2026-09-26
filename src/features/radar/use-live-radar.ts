"use client";

import { create } from "zustand";
import type { RadarEvent, RadarFiling } from "@/lib/radar/types";

export type LiveEntry =
  // `previous` keeps the last result on screen while a refresh runs.
  | { status: "loading"; message: string; previous?: RadarFiling }
  | { status: "ready"; filing: RadarFiling }
  | { status: "unsupported"; reason: string }
  | { status: "error"; error: string };

// Tickers read at once; each gets its own request so cards appear as they finish.
const CONCURRENCY = 3;

type State = {
  entries: Record<string, LiveEntry>;
  // Loads tickers not loaded yet (or all of them with fresh, which also re-checks SEC for newer filings).
  load: (tickers: string[], opts?: { fresh?: boolean }) => Promise<void>;
};

async function readOne(ticker: string, fresh: boolean, set: (ticker: string, e: LiveEntry) => void, previous?: RadarFiling) {
  const loading = (message: string): LiveEntry => ({ status: "loading", message, previous });
  set(ticker, loading("Finding the latest filings on SEC EDGAR"));
  try {
    const res = await fetch("/api/radar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickers: [ticker], fresh }),
    });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `Filing Radar failed (HTTP ${res.status})`);
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let done = false;
    let answered = false;
    while (!done) {
      const chunk = await reader.read();
      done = chunk.done;
      buffer += chunk.value ?? "";
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const e = JSON.parse(line) as RadarEvent;
        if (e.type === "progress") {
          set(e.ticker, loading(e.message));
          continue;
        }
        answered = true;
        if (e.type === "result") set(e.ticker, { status: "ready", filing: e.filing });
        else if (e.type === "unsupported") set(e.ticker, { status: "unsupported", reason: e.reason });
        else set(e.ticker, { status: "error", error: e.error });
      }
    }
    if (!answered) throw new Error("The connection closed before the comparison finished.");
  } catch (err) {
    set(ticker, { status: "error", error: err instanceof Error ? err.message : "Filing Radar failed" });
  }
}

export const useLiveRadar = create<State>()((set, get) => ({
  entries: {},
  load: async (tickers, opts = {}) => {
    const fresh = opts.fresh ?? false;
    const todo = tickers.filter((t) => {
      const e = get().entries[t];
      return fresh || !e || e.status === "error";
    });
    const put = (ticker: string, e: LiveEntry) => set((s) => ({ entries: { ...s.entries, [ticker]: e } }));
    let next = 0;
    const worker = async () => {
      while (next < todo.length) {
        const ticker = todo[next++];
        const prev = get().entries[ticker];
        await readOne(ticker, fresh, put, prev?.status === "ready" ? prev.filing : undefined);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
  },
}));
