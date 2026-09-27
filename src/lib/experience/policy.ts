// Pure: what each experience level opens by default. A level only changes presentation defaults (order, what starts
// open, wording, precision). It never changes inputs, calculations, rankings, sources or access, and it has no way to
// remove something: every section is either "open" or "collapsed", and the material set is always shown.

export type Level = "beginner" | "intermediate" | "advanced";
export const LEVELS: Level[] = ["beginner", "intermediate", "advanced"];
export const isLevel = (v: unknown): v is Level => v === "beginner" || v === "intermediate" || v === "advanced";

// There is deliberately no "absent": collapsed sections always show a count and a way in.
export type Disclosure = "open" | "collapsed";

export interface ExperiencePolicy {
  level: Level;
  version: 1;
  // inline: dotted underline on every term. subtle: faint underline. on-demand: no underline; the tooltip still opens
  // on hover and keyboard focus, so definitions are reachable at every level.
  glossary: "inline" | "subtle" | "on-demand";
  // Default state of each section's "Explain" and "Show calculation" controls.
  explain: Disclosure;
  calculation: Disclosure;
  precision: { pct: 1 | 2; usd: 0 | 2 };
  xray: {
    exposureRows: 3 | 10 | "all";
    holdings: Disclosure;
    sectors: Disclosure;
    overlap: Disclosure;
    learn: Disclosure;
    performance: Disclosure;
    range: Disclosure;
    compare: Disclosure;
    changes: Disclosure;
  };
  radar: { expand: "none" | "first" | "all"; lowSeverity: Disclosure; changes: Disclosure };
  shock: { sources: Disclosure; context: Disclosure; unaffected: Disclosure; sensitivities: Disclosure; holdingsTable: Disclosure; compare: Disclosure };
  ic: { pointsShown: 2 | "all"; keyTerms: Disclosure; checklist: Disclosure; audit: Disclosure; record: Disclosure };
  ask: { structure: "guided" | "connected" | "referenced"; maxWords: number };
}

const BEGINNER: ExperiencePolicy = {
  level: "beginner",
  version: 1,
  glossary: "inline",
  explain: "open",
  calculation: "collapsed",
  precision: { pct: 1, usd: 0 },
  xray: { exposureRows: 3, holdings: "collapsed", sectors: "collapsed", overlap: "open", learn: "open", performance: "collapsed", range: "collapsed", compare: "collapsed", changes: "collapsed" },
  radar: { expand: "none", lowSeverity: "collapsed", changes: "collapsed" },
  shock: { sources: "collapsed", context: "collapsed", unaffected: "collapsed", sensitivities: "collapsed", holdingsTable: "collapsed", compare: "collapsed" },
  ic: { pointsShown: 2, keyTerms: "open", checklist: "collapsed", audit: "collapsed", record: "collapsed" },
  ask: { structure: "guided", maxWords: 180 },
};

const INTERMEDIATE: ExperiencePolicy = {
  level: "intermediate",
  version: 1,
  glossary: "subtle",
  explain: "collapsed",
  calculation: "collapsed",
  precision: { pct: 1, usd: 0 },
  xray: { exposureRows: 10, holdings: "open", sectors: "open", overlap: "open", learn: "collapsed", performance: "collapsed", range: "collapsed", compare: "open", changes: "open" },
  radar: { expand: "first", lowSeverity: "open", changes: "open" },
  shock: { sources: "collapsed", context: "open", unaffected: "open", sensitivities: "open", holdingsTable: "collapsed", compare: "collapsed" },
  ic: { pointsShown: "all", keyTerms: "collapsed", checklist: "open", audit: "collapsed", record: "collapsed" },
  ask: { structure: "connected", maxWords: 220 },
};

const ADVANCED: ExperiencePolicy = {
  level: "advanced",
  version: 1,
  glossary: "on-demand",
  explain: "collapsed",
  calculation: "open",
  precision: { pct: 2, usd: 2 },
  xray: { exposureRows: "all", holdings: "open", sectors: "open", overlap: "open", learn: "collapsed", performance: "open", range: "open", compare: "open", changes: "open" },
  radar: { expand: "all", lowSeverity: "open", changes: "open" },
  shock: { sources: "open", context: "open", unaffected: "open", sensitivities: "open", holdingsTable: "open", compare: "open" },
  ic: { pointsShown: "all", keyTerms: "collapsed", checklist: "open", audit: "open", record: "open" },
  ask: { structure: "referenced", maxWords: 260 },
};

export const POLICIES: Record<Level, ExperiencePolicy> = { beginner: BEGINNER, intermediate: INTERMEDIATE, advanced: ADVANCED };

export function policyFor(level: Level): ExperiencePolicy {
  return POLICIES[level];
}

export const isOpen = (d: Disclosure) => d === "open";
