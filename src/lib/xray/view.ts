// Pure: what the X-Ray shows first at an experience level. The model is never changed; the view only decides row
// counts and what starts open. The material set (value and valuation time, concentration flags, coverage gaps,
// funds we can't see into) is returned at every level, and anything collapsed carries a count.
import type { ExperiencePolicy, Disclosure } from "@/lib/experience/policy";
import type { Coverage, XExposure, XrayModel } from "./types";

// A fund whose ticker-level holdings cover less than this share of its weight gets a coverage notice.
export const COVERAGE_NOTICE = 0.99;

export type XrayMaterial = {
  total: number;
  valuation: XrayModel["priceBasis"] | null;
  flags: XrayModel["flags"];
  // Funds we can only partly see into, and positions we can't see into at all.
  partial: Coverage[];
  opaque: string[];
};

export type XrayView = {
  material: XrayMaterial;
  exposures: { all: XExposure[]; initial: number; hidden: number; listedIsComplete: boolean };
  sections: Record<"holdings" | "sectors" | "overlap" | "learn" | "performance" | "range" | "compare" | "changes", Disclosure>;
  // Path columns in the detailed table: Direct plus every fund with look-through.
  vias: string[];
  showViaColumns: boolean;
};

export function xrayMaterial(model: XrayModel): XrayMaterial {
  return {
    total: model.total,
    valuation: model.priceBasis ?? null,
    flags: model.flags,
    partial: (model.coverage ?? []).filter((c) => c.kind === "etf" && c.visibleShare !== null && c.visibleShare < COVERAGE_NOTICE),
    opaque: model.opaque,
  };
}

export function xrayView(model: XrayModel, policy: ExperiencePolicy): XrayView {
  const all = model.exposures?.length ? model.exposures : model.topTen;
  const rows = policy.xray.exposureRows;
  const initial = rows === "all" ? all.length : Math.min(rows, all.length);
  return {
    material: xrayMaterial(model),
    exposures: { all, initial, hidden: all.length - initial, listedIsComplete: all.length >= model.underlyingCompanies },
    sections: {
      holdings: policy.xray.holdings,
      sectors: policy.xray.sectors,
      overlap: policy.xray.overlap,
      learn: policy.xray.learn,
      performance: policy.xray.performance,
      range: policy.xray.range,
      compare: policy.xray.compare,
      changes: policy.xray.changes,
    },
    vias: ["Direct", ...model.etfColumns],
    showViaColumns: policy.level === "advanced",
  };
}
