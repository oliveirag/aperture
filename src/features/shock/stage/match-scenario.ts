import { SCENARIOS } from "@/data/shock";
import type { ScenarioId } from "@/types/demo";

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Short keywords ("ai", "cre") must be whole words; longer ones may prefix a word ("chip" matches "chips").
function hasKeyword(text: string, keyword: string) {
  const k = escape(keyword);
  const re = keyword.length <= 3 ? new RegExp(`\\b${k}\\b`) : new RegExp(`\\b${k}`);
  return re.test(text);
}

// "office values drop 25%" -> { id: "cre", severity: 25 }; no match -> null. Keyword match only, no parsing model.
export function matchScenario(input: string): { id: ScenarioId; severity: number } | null {
  const text = input.toLowerCase();
  const scenario = SCENARIOS.find((s) => s.keywords.some((k) => hasKeyword(text, k)));
  if (!scenario) return null;
  const n = text.match(/(\d+(?:\.\d+)?)/);
  const raw = n ? Math.round(Number(n[1])) : scenario.baseSeverity;
  const severity = Math.min(scenario.maxSeverity, Math.max(scenario.minSeverity, raw));
  return { id: scenario.id, severity };
}
