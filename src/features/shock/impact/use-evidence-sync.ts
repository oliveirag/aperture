"use client";

import { useEffect } from "react";
import { useSourceDrawer } from "@/components/shared/source-drawer";
import { getScenario } from "@/data/shock";
import { useShock } from "@/features/shock/store";
import { useLevel } from "@/lib/level";

// "CRE −20%" at severity 30 -> "CRE −30%"
export function shortLabelAt(shortLabel: string, severity: number) {
  return `${shortLabel.split(" −")[0]} −${severity}%`;
}

// Keeps the evidence drawer and the shared selectedEdgeId in step, whether the edge was picked here or in the graph.
export function useEvidenceSync() {
  const edgeId = useShock((s) => s.selectedEdgeId);
  const scenarioId = useShock((s) => s.scenarioId);
  const severity = useShock((s) => s.severity);
  const level = useLevel((s) => s.level);

  useEffect(() => {
    if (!edgeId) return;
    const scenario = getScenario(scenarioId);
    const edge = scenario.edges.find((e) => e.id === edgeId);
    const source = edge && scenario.sources.find((s) => s.id === edge.sourceId);
    if (!edge || !source) return;
    const label = (id: string) => scenario.nodes.find((n) => n.id === id)?.label ?? id;
    const meta = [
      { label: "Link", value: `${label(edge.from)} → ${label(edge.to)}` },
      { label: "Scenario", value: shortLabelAt(scenario.shortLabel, severity) },
    ];
    if (level === "advanced") {
      meta.push({ label: "Transmission weight", value: edge.weight.toFixed(2) }, { label: "Method", value: edge.method });
    }
    useSourceDrawer.getState().open({ source, meta });
  }, [edgeId, scenarioId, severity, level]);

  // Closing the drawer (X, Escape, overlay) clears the selected edge.
  useEffect(
    () =>
      useSourceDrawer.subscribe((state, prev) => {
        if (prev.payload && !state.payload && useShock.getState().selectedEdgeId) useShock.getState().selectEdge(null);
      }),
    [],
  );
}
