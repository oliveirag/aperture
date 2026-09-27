"use client";

import { useEffect } from "react";
import { useSourceDrawer } from "@/components/shared/source-drawer";
import { useShock } from "@/features/shock/store";
import { scenarioIn, type ShockModel } from "@/features/shock/use-shock-model";
import { isOpen } from "@/lib/experience/policy";
import { usePolicy } from "@/lib/experience/store";

// "CRE −20%" at severity 30 -> "CRE −30%"; "Oil price +20%" at 25 -> "Oil price +25%". Keeps the label's own sign.
export function shortLabelAt(shortLabel: string, severity: number) {
  const m = shortLabel.match(/^(.*?)\s*([+−-])\s*\d+(?:\.\d+)?%$/);
  if (!m) return `${shortLabel} (${severity}%)`;
  return `${m[1]} ${m[2] === "+" ? "+" : "−"}${severity}%`;
}

// Keeps the evidence drawer and the shared selectedEdgeId in step, whether the edge was picked here or in the graph.
export function useEvidenceSync(model: ShockModel) {
  const edgeId = useShock((s) => s.selectedEdgeId);
  const scenarioId = useShock((s) => s.scenarioId);
  const severity = useShock((s) => s.severity);
  const policy = usePolicy();
  const showMethod = isOpen(policy.calculation);

  useEffect(() => {
    if (!edgeId) return;
    const scenario = scenarioIn(model, scenarioId);
    const edge = scenario.edges.find((e) => e.id === edgeId);
    const source = edge && scenario.sources.find((s) => s.id === edge.sourceId);
    if (!edge || !source) return;
    const label = (id: string) => scenario.nodes.find((n) => n.id === id)?.label ?? id;
    const meta = [
      { label: "Link", value: `${label(edge.from)} → ${label(edge.to)}` },
      { label: "Scenario", value: shortLabelAt(scenario.shortLabel, severity) },
    ];
    // Method details follow the level's calculation default; the drawer always names the link and the scenario.
    if (showMethod) {
      meta.push({ label: "Transmission weight", value: edge.weight.toFixed(2) }, { label: "Method", value: edge.method });
    }
    useSourceDrawer.getState().open({ source, meta });
  }, [edgeId, scenarioId, severity, showMethod, model]);

  // Closing the drawer (X, Escape, overlay) clears the selected edge.
  useEffect(
    () =>
      useSourceDrawer.subscribe((state, prev) => {
        if (prev.payload && !state.payload && useShock.getState().selectedEdgeId) useShock.getState().selectEdge(null);
      }),
    [],
  );
}
