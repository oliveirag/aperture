// Pure: how the Filing Radar feed is laid out at an experience level. Counts and coverage always describe every
// filing reviewed; a level can only collapse lower-severity cards behind a counted "show" row, never drop them.
import type { Severity } from "@/data/radar";
import type { ExperiencePolicy } from "@/lib/experience/policy";

export type FeedView<T> = {
  // Cards shown in the feed now, and lower-severity cards behind a "show N" row.
  visible: T[];
  collapsed: T[];
  // Every card's severity, for the coverage counts (never reduced by the level).
  counts: Partial<Record<Severity, number>>;
  expanded: string[];
};

export function feedView<T extends { id: string; severity: Severity }>(cards: T[], policy: ExperiencePolicy, showLow: boolean): FeedView<T> {
  const counts: Partial<Record<Severity, number>> = {};
  for (const c of cards) counts[c.severity] = (counts[c.severity] ?? 0) + 1;
  const hideLow = policy.radar.lowSeverity === "collapsed" && !showLow;
  const visible = hideLow ? cards.filter((c) => c.severity !== "low") : cards;
  const collapsed = hideLow ? cards.filter((c) => c.severity === "low") : [];
  const ids = visible.map((c) => c.id);
  const expanded = policy.radar.expand === "all" ? ids : policy.radar.expand === "first" ? ids.slice(0, 1) : [];
  return { visible, collapsed, counts, expanded };
}
