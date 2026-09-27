// Pure: the compact portfolio JSON Ask answers from. Numbers are copied from the X-Ray model, so answers match the page.
// It carries provenance (when values are from, what is covered and what isn't) so answers can state their own gaps, and
// trims long lists with explicit "omitted" counts instead of failing.
import type { RadarCard } from "@/data/radar";
import type { IcMemo } from "@/lib/ic/types";
import type { XrayModel } from "@/lib/xray/types";
import { COVERAGE_NOTICE } from "@/lib/xray/view";

const r = (n: number, digits = 4) => Math.round(n * 10 ** digits) / 10 ** digits;

export type AskMemo = { ticker: string; date: string; memo: Pick<IcMemo, "stance" | "summary" | "bull" | "bear" | "keyRisks" | "watch" | "chairNote"> };

// How the Radar checks for the covered companies came out; "not yet checked" and failures are gaps, not "no change".
export type RadarStatus = { covered: number; withChanges: number; noMaterialChange: number; failed: number; unsupported: number; notChecked: number };

export const LIMITS = { positions: 60, radar: 10, memos: 5 };

function capped<T>(list: T[], max: number) {
  return { items: list.slice(0, max), omitted: Math.max(0, list.length - max) };
}

export function askContext(opts: {
  kind: "demo" | "imported" | "practice";
  model: XrayModel;
  names: Record<string, string>;
  radar: Pick<RadarCard, "ticker" | "company" | "severity" | "title" | "summary" | "filingType" | "filedAt" | "exposureWeight">[];
  radarStatus?: RadarStatus;
  memos: AskMemo[];
}) {
  const { model } = opts;
  const positions = capped(model.map.positions, LIMITS.positions);
  const radar = capped(opts.radar, LIMITS.radar);
  const memos = capped(opts.memos, LIMITS.memos);
  const partial = (model.coverage ?? []).filter((c) => c.kind === "etf" && c.visibleShare !== null && c.visibleShare < COVERAGE_NOTICE);
  const gaps = [
    ...partial.map((c) => `${c.ticker}: only ${Math.round((c.visibleShare ?? 0) * 100)}% of the fund's weight is visible as individual companies`),
    ...model.opaque.map((t) => `${t}: no published holdings, counted as a single position`),
    ...(opts.radarStatus && opts.radarStatus.failed ? [`Filing Radar failed for ${opts.radarStatus.failed} companies`] : []),
    ...(opts.radarStatus && opts.radarStatus.notChecked ? [`Filing Radar has not checked ${opts.radarStatus.notChecked} covered companies yet`] : []),
  ];
  return {
    portfolio: {
      kind: opts.kind === "practice" ? "practice (hypothetical money)" : opts.kind,
      valuation: model.valuation ?? (opts.kind === "demo" ? { asOf: "dated demo snapshot", source: "Demo" } : null),
      totalValueUsd: Math.round(model.total),
      positionsCount: model.positionsCount,
      underlyingCompanies: model.underlyingCompanies,
      positions: positions.items.map((p) => ({
        ticker: p.ticker,
        name: opts.names[p.ticker] ?? undefined,
        category: p.category,
        valueUsd: Math.round(p.value),
        weight: r(p.weight),
      })),
      ...(positions.omitted ? { positionsOmitted: positions.omitted } : {}),
      fundsWithoutAperture: model.opaque,
    },
    apertureTop10: model.topTen.map((e) => ({
      ticker: e.ticker,
      name: e.name,
      valueUsd: Math.round(e.value),
      weight: r(e.value / model.total),
      paths: e.sources.map((s) => ({ via: s.via, weight: r(s.value / model.total) })),
    })),
    sectors: model.sectors.map((s) => ({ sector: s.sector, weight: r(s.weight) })),
    concentrationFlags: model.flags.map((f) => ({ kind: f.kind, label: f.label, weight: r(f.weight), threshold: f.threshold })),
    etfOverlaps: model.overlaps.slice(0, 6).map((o) => ({ a: o.a, b: o.b, overlapByWeight: r(o.overlap), sharedCompanies: o.sharedCompanies })),
    filingRadar: radar.items.map((c) => ({
      ticker: c.ticker,
      company: c.company,
      severity: c.severity,
      change: c.title,
      summary: c.summary,
      filing: `${c.filingType} filed ${c.filedAt}`,
      apertureWeight: r(c.exposureWeight),
    })),
    ...(radar.omitted ? { filingRadarOmitted: radar.omitted } : {}),
    filingRadarStatus: opts.radarStatus ?? null,
    icMemos: memos.items,
    gaps,
  };
}
