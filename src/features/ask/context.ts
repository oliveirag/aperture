// Pure: the compact portfolio JSON Ask answers from. Numbers are copied from the X-Ray model, so answers match the page.
import type { RadarCard } from "@/data/radar";
import type { IcMemo } from "@/lib/ic/types";
import type { XrayModel } from "@/lib/xray/types";

const r = (n: number, digits = 4) => Math.round(n * 10 ** digits) / 10 ** digits;

export type AskMemo = { ticker: string; date: string; memo: Pick<IcMemo, "stance" | "summary" | "bull" | "bear" | "keyRisks" | "watch" | "chairNote"> };

export function askContext(opts: {
  kind: "demo" | "imported" | "practice";
  model: XrayModel;
  names: Record<string, string>;
  radar: Pick<RadarCard, "ticker" | "company" | "severity" | "title" | "summary" | "filingType" | "filedAt" | "exposureWeight">[];
  memos: AskMemo[];
}) {
  const { model } = opts;
  return {
    portfolio: {
      kind: opts.kind === "practice" ? "practice (hypothetical money)" : opts.kind,
      totalValueUsd: Math.round(model.total),
      positionsCount: model.positionsCount,
      underlyingCompanies: model.underlyingCompanies,
      positions: model.map.positions.map((p) => ({
        ticker: p.ticker,
        name: opts.names[p.ticker] ?? undefined,
        category: p.category,
        valueUsd: Math.round(p.value),
        weight: r(p.weight),
      })),
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
    filingRadar: opts.radar.map((c) => ({
      ticker: c.ticker,
      company: c.company,
      severity: c.severity,
      change: c.title,
      summary: c.summary,
      filing: `${c.filingType} filed ${c.filedAt}`,
      apertureWeight: r(c.exposureWeight),
    })),
    icMemos: opts.memos,
  };
}
