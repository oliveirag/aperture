"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { RadarFiling, RadarResult } from "@/app/api/radar/route";
import { HIGH_SEVERITY_EXPOSURE, RADAR_CARDS, RADAR_HEADLINE, RADAR_LAST_CHECKED, type RadarCard } from "@/data/radar";
import { formatPct } from "@/lib/format";
import type { XExposure, XrayModel } from "@/lib/xray/types";
import type { LeveledText } from "@/types/demo";
import { useXray } from "@/features/xray/use-xray";

// Companies covered per portfolio, largest exposure first. Each costs one Gemini call on a cold cache.
const MAX_COMPANIES = 6;
const CONCURRENCY = 2;

type Done = { status: "done"; result: RadarResult; checkedAt: number };
// A refresh keeps the previous answer on screen until the new one lands.
type Entry = { status: "loading"; prev?: Done } | Done
  | { status: "error"; error: string };

type Store = {
  entries: Record<string, Entry>;
  run: (tickers: string[], refresh?: boolean) => void;
};

async function fetchRadar(ticker: string, refresh: boolean): Promise<Entry> {
  try {
    const res = await fetch("/api/radar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, refresh }),
      signal: AbortSignal.timeout(100000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { status: "error", error: data.error ?? `HTTP ${res.status}` };
    return { status: "done", result: data as RadarResult, checkedAt: Date.now() };
  } catch {
    return { status: "error", error: "Couldn't reach the server." };
  }
}

// Results survive navigation; the server caches each filing pair too, so revisits are instant.
const useRadarStore = create<Store>()((set, get) => ({
  entries: {},
  run: (tickers, refresh = false) => {
    const queue = tickers.filter((t) => refresh || !get().entries[t] || get().entries[t].status === "error");
    if (queue.length === 0) return;
    set((s) => ({
      entries: {
        ...s.entries,
        ...Object.fromEntries(
          queue.map((t) => {
            const old = s.entries[t];
            return [t, { status: "loading", prev: old?.status === "done" ? old : old?.status === "loading" ? old.prev : undefined } as Entry];
          }),
        ),
      },
    }));
    const worker = async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        const entry = await fetchRadar(t, refresh);
        set((s) => ({ entries: { ...s.entries, [t]: entry } }));
      }
    };
    for (let i = 0; i < CONCURRENCY; i++) void worker();
  },
}));

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six"];
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function joinList(items: string[]) {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// Deterministic: the percentage and paths come from the X-Ray, never from the model.
function whyItMatters(e: XExposure, total: number) {
  const pct = formatPct(e.value / total);
  const paths = e.sources.map((s) => (s.via === "Direct" ? e.ticker : s.via));
  if (paths.length > 1) return `${e.name} is ${pct} of your money across ${joinList(paths)}. A change here reaches ${paths.length} of your positions at once.`;
  if (paths[0] === e.ticker) return `${e.name} is ${pct} of your money, held directly.`;
  return `${e.name} is ${pct} of your money, held through ${paths[0]}.`;
}

function toCard(filing: RadarFiling, e: XExposure, total: number): RadarCard {
  return { ...filing, company: e.name || filing.company, color: e.color, exposureWeight: e.value / total, whyItMatters: whyItMatters(e, total) };
}

function headline(cards: RadarCard[], reviewed: number): LeveledText {
  const high = cards.filter((c) => c.severity === "high");
  const pct = formatPct(high.reduce((s, c) => s + c.exposureWeight, 0));
  const count = (sev: RadarCard["severity"]) => cards.filter((c) => c.severity === sev).length;
  if (cards.length === 0) {
    return {
      beginner: "None of the companies you own made a big change to how they describe their risks.",
      intermediate: `No material risk changes across ${reviewed} ${plural(reviewed, "filing", "filings")}.`,
      advanced: `0 material Item 1A changes across ${reviewed} 10-K ${plural(reviewed, "pair", "pairs")}.`,
    };
  }
  return {
    beginner: `${WORDS[Math.min(cards.length, 6)]} ${plural(cards.length, "company you own changed", "companies you own changed")} how they describe their biggest risks.`,
    intermediate:
      high.length > 0
        ? `${high.length} high-severity ${plural(high.length, "change", "changes")} in companies that make up ${pct} of your money.`
        : `${cards.length} ${plural(cards.length, "company", "companies")} changed ${plural(cards.length, "its", "their")} risk factors; none rated high severity.`,
    advanced: `${count("high")} high, ${count("medium")} medium, ${count("low")} low severity changes across ${reviewed} 10-K ${plural(reviewed, "pair", "pairs")}; high-severity names are ${pct} of look-through exposure.`,
  };
}

export type PendingCompany = { ticker: string; name: string; error?: string };
export type OtherCompany = { ticker: string; name: string; note: string };

export type RadarView =
  | { mode: "loading" }
  | { mode: "xray-error"; error: string; retry: () => void }
  | {
      mode: "demo" | "live";
      cards: RadarCard[];
      headline: LeveledText;
      highExposure: number;
      lastChecked: string;
      reviewed: number;
      pending: PendingCompany[];
      others: OtherCompany[];
      checking: boolean;
      recheck: () => void;
      refreshOne: (ticker: string) => void;
      refreshing: (ticker: string) => boolean;
    };

// The companies Radar covers: the biggest look-through exposures that are companies (funds are covered through them).
function coverage(model: XrayModel) {
  return model.topTen.filter((e) => !model.opaque.includes(e.ticker)).slice(0, MAX_COMPANIES);
}

const SEVERITY_RANK = { high: 3, medium: 2, low: 1 } as const;
const checkedLabel = (t: number) =>
  new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

// Filing Radar for the active portfolio: the curated cards for the demo, real SEC 10-K diffs for anything else.
export function useRadar(): RadarView {
  const xray = useXray();
  const entries = useRadarStore((s) => s.entries);
  const run = useRadarStore((s) => s.run);
  const live = xray.status === "ready" && xray.model.mode === "live" ? xray.model : null;
  const companies = live ? coverage(live) : [];
  const key = companies.map((c) => c.ticker).join(",");

  useEffect(() => {
    if (key) run(key.split(","));
  }, [key, run]);

  if (xray.status === "loading") return { mode: "loading" };
  if (xray.status === "error") return { mode: "xray-error", error: xray.error, retry: xray.retry };

  if (!live) {
    return {
      mode: "demo",
      cards: RADAR_CARDS,
      headline: RADAR_HEADLINE,
      highExposure: HIGH_SEVERITY_EXPOSURE,
      lastChecked: RADAR_LAST_CHECKED,
      reviewed: RADAR_CARDS.length,
      pending: [],
      others: [],
      checking: false,
      recheck: () => {},
      refreshOne: () => {},
      refreshing: () => false,
    };
  }

  const cards: RadarCard[] = [];
  const pending: PendingCompany[] = [];
  const others: OtherCompany[] = [];
  let reviewed = 0;
  let latest = 0;
  for (const e of companies) {
    const raw = entries[e.ticker];
    const entry = raw?.status === "loading" && raw.prev ? raw.prev : raw;
    if (!entry || entry.status === "loading") pending.push({ ticker: e.ticker, name: e.name });
    else if (entry.status === "error") pending.push({ ticker: e.ticker, name: e.name, error: entry.error });
    else {
      latest = Math.max(latest, entry.checkedAt);
      const r = entry.result;
      if (r.status === "ok") {
        reviewed++;
        cards.push(toCard(r.card, e, live.total));
      } else if (r.status === "quiet") {
        reviewed++;
        others.push({ ticker: e.ticker, name: e.name, note: `No material changes in its ${r.filedAt.slice(0, 4)} 10-K` });
      } else others.push({ ticker: e.ticker, name: e.name, note: r.reason });
    }
  }
  cards.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.exposureWeight - a.exposureWeight);

  return {
    mode: "live",
    cards,
    headline: headline(cards, reviewed),
    highExposure: cards.filter((c) => c.severity === "high").reduce((s, c) => s + c.exposureWeight, 0),
    lastChecked: latest ? checkedLabel(latest) : "not yet",
    reviewed,
    pending,
    others,
    checking: companies.some((e) => entries[e.ticker]?.status === "loading"),
    recheck: () => run(companies.map((c) => c.ticker), true),
    refreshOne: (ticker) => run([ticker], true),
    refreshing: (ticker) => entries[ticker]?.status === "loading",
  };
}
