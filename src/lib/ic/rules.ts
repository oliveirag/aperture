// Pure: a rules-based committee for when the AI committee is unavailable. Each point is computed from the numbers
// behind one fact (reported revenue, margins, cash flow, valuation, analyst ratings, Filing Radar, portfolio fit)
// with fixed thresholds, and cites that fact. It never reads or judges the thesis wording, and says so.
import type { Assumption, EvidenceLine, FitRow, IcLevel, MemoPoint } from "@/data/ic-room";
import { formatPct, formatUSD } from "@/lib/format";
import type { Side } from "./committee";
import { FIT_REF } from "./committee";
import { billions, monthYear, type Fact, type Signal } from "./facts";
import type { IcMemo, Stance } from "./types";

export const CHAIR_ONLY_NOTE = "The analysts' points come from the AI committee; the chair was unavailable, so this memo was assembled from them by fixed rules.";
export const RULES_NOTE = "Rules-based memo: the AI committee was unavailable, so each point is computed from the cited facts with fixed thresholds. It does not evaluate your thesis wording.";

type Point = MemoPoint & { risk?: string };
type Found<K extends Signal["kind"]> = { id: string; s: Signal & { kind: K } };

function find<K extends Signal["kind"]>(facts: Fact[], kind: K): Found<K> | null {
  const f = facts.find((x) => x.signal?.kind === kind);
  return f ? { id: f.id, s: f.signal as Signal & { kind: K } } : null;
}

const growth = (latest: number, prior: number | null) => (prior && prior > 0 ? latest / prior - 1 : null);
const x = (n: number) => `${n.toFixed(n >= 100 ? 0 : 1)}×`;

export type Evidence = {
  bull: Point[];
  bear: Point[];
  assumptions: Assumption[];
  watch: MemoPoint[];
  fitLine: string;
};

// Every rule that fires, split into points for and against, plus the "what must be true" checks.
export function evaluate(name: string, facts: Fact[], fit: FitRow[]): Evidence {
  const bull: Point[] = [];
  const bear: Point[] = [];
  const revenue = find(facts, "revenue");
  const income = find(facts, "netIncome");
  const cash = find(facts, "cash");
  const debt = find(facts, "debt");
  const market = find(facts, "market");
  const analysts = find(facts, "analysts");
  const earnings = find(facts, "earnings");
  const radar = find(facts, "radar");

  const revGrowth = revenue ? growth(revenue.s.latest, revenue.s.yearAgo) : null;
  if (revenue && revGrowth !== null) {
    const when = monthYear(revenue.s.end);
    if (revGrowth >= 0.1) bull.push({ text: `Revenue grew ${formatPct(revGrowth)} year over year to ${billions(revenue.s.latest)} in the quarter ended ${when}.`, refs: [revenue.id] });
    else if (revGrowth <= -0.05) bear.push({ text: `Revenue fell ${formatPct(-revGrowth)} year over year to ${billions(revenue.s.latest)} in the quarter ended ${when}.`, refs: [revenue.id], risk: "Shrinking revenue" });
  }

  if (income) {
    const g = growth(income.s.latest, income.s.yearAgo);
    if (income.s.latest < 0) bear.push({ text: `Reported a net loss of ${billions(-income.s.latest)} in the latest quarter.`, refs: [income.id], risk: "Unprofitable" });
    else if (income.s.yearAgo !== null && income.s.yearAgo <= 0) bull.push({ text: `Turned a year-ago loss into ${billions(income.s.latest)} of net income.`, refs: [income.id] });
    else if (g !== null && g >= 0.15) bull.push({ text: `Net income rose ${formatPct(g)} year over year to ${billions(income.s.latest)}.`, refs: [income.id] });
    else if (g !== null && g <= -0.15) bear.push({ text: `Net income fell ${formatPct(-g)} year over year to ${billions(income.s.latest)}.`, refs: [income.id], risk: "Falling profits" });
  }

  if (cash) {
    if (cash.s.latest > 0) bull.push({ text: `Generated ${billions(cash.s.latest)} of operating cash in the fiscal year ended ${monthYear(cash.s.end)}.`, refs: [cash.id] });
    else bear.push({ text: `Operating cash flow was negative (${billions(cash.s.latest)}) in the fiscal year ended ${monthYear(cash.s.end)}.`, refs: [cash.id], risk: "Cash burn" });
  }
  if (debt && cash && cash.s.latest > 0 && debt.s.value > cash.s.latest * 4) {
    bear.push({ text: `Total debt of ${billions(debt.s.value)} is more than four years of operating cash flow.`, refs: [debt.id, cash.id], risk: "Heavy debt load" });
  }

  if (market) {
    const { pe, margin, beta, price, low, high } = market.s;
    if (pe !== null && pe > 40) bear.push({ text: `Trades at ${x(pe)} trailing earnings, so the price already assumes strong growth.`, refs: [market.id], risk: `Rich valuation (P/E ${pe.toFixed(0)})` });
    else if (pe !== null && pe > 0 && pe < 18) bull.push({ text: `Trades at a modest ${x(pe)} trailing earnings.`, refs: [market.id] });
    if (margin !== null && margin >= 20) bull.push({ text: `Keeps ${margin.toFixed(1)}% of revenue as net profit over the last twelve months.`, refs: [market.id] });
    else if (margin !== null && margin < 0) bear.push({ text: `Net margin over the last twelve months is negative (${margin.toFixed(1)}%).`, refs: [market.id], risk: "Negative margins" });
    if (beta !== null && beta >= 1.5) bear.push({ text: `Beta of ${beta.toFixed(2)}: historically it has swung more than the market in both directions.`, refs: [market.id], risk: "High volatility" });
    if (price !== null && low !== null && high !== null && high > low) {
      const position = (price - low) / (high - low);
      if (position >= 0.9) bear.push({ text: `Trades near the top of its 52-week range (${formatUSD(low, 2)} to ${formatUSD(high, 2)}).`, refs: [market.id], risk: "Near 52-week high" });
    }
  }

  if (analysts) {
    const { positive, neutral, negative } = analysts.s;
    const total = positive + neutral + negative;
    if (total >= 5 && positive / total >= 0.7) bull.push({ text: `${positive} of ${total} analysts covering it rate it positively.`, refs: [analysts.id] });
    if (total >= 5 && negative / total >= 0.2) bear.push({ text: `${negative} of ${total} analysts covering it rate it negatively.`, refs: [analysts.id], risk: "Analyst skepticism" });
  }

  if (radar && (radar.s.severity === "high" || radar.s.severity === "medium")) {
    const verb = radar.s.change === "new" ? "added" : radar.s.change === "removed" ? "removed" : "reworded";
    const topic = radar.s.category ? ` on ${radar.s.category.split(" · ").pop()!.toLowerCase()}` : "";
    bear.push({ text: `Its latest ${radar.s.form} ${verb} risk-factor language${topic}: “${radar.s.label}”.`, refs: [radar.id], risk: radar.s.category || "New filing risk" });
  }

  // Portfolio fit: the candidate's own row, then the largest sector after the trade.
  const [, candidate, ...rest] = fit;
  const sectors = rest.filter((r) => r.label.endsWith("sector") || r.label.endsWith("sector (your largest)"));
  const topSector = sectors.sort((a, b) => b.after - a.after)[0];
  if (candidate) {
    if (candidate.after >= 0.15) bear.push({ text: `${candidate.label.replace(" look-through", "")} would be ${formatPct(candidate.after)} of your money, a concentrated bet.`, refs: [FIT_REF], risk: "Concentration in your portfolio" });
    else if (candidate.before < 0.01 && candidate.after > candidate.before) bull.push({ text: `Adds a company you barely own today: ${formatPct(candidate.before)} of your money before, ${formatPct(candidate.after)} after.`, refs: [FIT_REF] });
    else if (candidate.before >= 0.03) bear.push({ text: `You already hold ${formatPct(candidate.before)} of your money in it; this takes it to ${formatPct(candidate.after)}.`, refs: [FIT_REF], risk: "Adds to an existing exposure" });
  }
  if (topSector && topSector.after >= 0.4) {
    bear.push({ text: `${topSector.label.replace(" (your largest)", "")} would be ${formatPct(topSector.after)} of your portfolio after this.`, refs: [FIT_REF], risk: "Sector concentration" });
  }

  const line = (text: string, factId: string): EvidenceLine => ({ text, factId });
  const checks: { text: string; for: EvidenceLine[]; against: EvidenceLine[] }[] = [
    {
      text: "Revenue keeps growing at a healthy pace",
      for: revenue && revGrowth !== null && revGrowth > 0 ? [line(`Revenue grew ${formatPct(revGrowth)} year over year.`, revenue.id)] : [],
      against: [
        ...(revenue && revGrowth !== null && revGrowth <= 0 ? [line(`Revenue changed ${formatPct(revGrowth)} year over year.`, revenue.id)] : []),
        ...(market?.s.pe && market.s.pe > 40 ? [line(`At ${x(market.s.pe)} earnings, the price leaves little room for a slowdown.`, market.id)] : []),
      ],
    },
    {
      text: "Profits and cash flow hold up",
      for: [
        ...(market?.s.margin != null && market.s.margin >= 10 ? [line(`Net margin is ${market.s.margin.toFixed(1)}% over twelve months.`, market.id)] : []),
        ...(cash && cash.s.latest > 0 ? [line(`Operating cash flow was ${billions(cash.s.latest)} last fiscal year.`, cash.id)] : []),
      ].slice(0, 2),
      against: [
        ...(income && income.s.latest < 0 ? [line("The latest quarter was a net loss.", income.id)] : []),
        ...(income && income.s.yearAgo && income.s.yearAgo > 0 && income.s.latest < income.s.yearAgo * 0.85 ? [line("Net income fell year over year.", income.id)] : []),
      ],
    },
    {
      text: "The balance sheet can carry the business",
      for: cash && cash.s.latest > 0 && (!debt || debt.s.value <= cash.s.latest * 4) ? [line(`Operating cash flow covers debt${debt ? ` of ${billions(debt.s.value)}` : ""} comfortably.`, (debt ?? cash).id)] : [],
      against: debt && cash && cash.s.latest > 0 && debt.s.value > cash.s.latest * 4 ? [line(`Debt of ${billions(debt.s.value)} exceeds four years of operating cash.`, debt.id)] : [],
    },
    {
      text: "The position size fits your portfolio",
      for: candidate && candidate.after < 0.1 ? [line(`It would be ${formatPct(candidate.after)} of your money.`, FIT_REF)] : [],
      against: [
        ...(candidate && candidate.after >= 0.15 ? [line(`It would be ${formatPct(candidate.after)} of your money.`, FIT_REF)] : []),
        ...(topSector && topSector.after >= 0.4 ? [line(`${topSector.label.replace(" (your largest)", "")} would reach ${formatPct(topSector.after)}.`, FIT_REF)] : []),
      ],
    },
  ];
  const assumptions: Assumption[] = checks
    .filter((c) => c.for.length + c.against.length > 0)
    .map((c, i) => ({
      id: `A${i + 1}`,
      text: c.text,
      status: c.for.length && c.against.length ? "contested" : c.for.length ? "supported" : "unresolved",
      for: c.for,
      against: c.against,
    }));

  // Each watch item cites the fact it follows from.
  const watch: MemoPoint[] = [
    earnings ? { text: `Next earnings on ${earnings.s.date}`, refs: [earnings.id] } : null,
    radar?.s.category ? { text: `Further changes in ${radar.s.category.split(" · ").pop()!.toLowerCase()} disclosures`, refs: [radar.id] } : null,
    revenue ? { text: "Whether year-over-year revenue growth holds next quarter", refs: [revenue.id] } : null,
    analysts ? { text: "Shifts in analyst ratings", refs: [analysts.id] } : null,
  ].filter((w): w is MemoPoint => w !== null).slice(0, 4);

  const fitLine = candidate
    ? `${candidate.label.replace(" look-through", "")} goes from ${formatPct(candidate.before)} to ${formatPct(candidate.after)} of your money${topSector ? `; ${topSector.label.replace(" (your largest)", "").toLowerCase()} from ${formatPct(topSector.before)} to ${formatPct(topSector.after)}` : ""}.`
    : "";
  return { bull: bull.slice(0, 4), bear: bear.slice(0, 4), assumptions, watch, fitLine };
}

function statementFor(side: "bull" | "bear", name: string, points: MemoPoint[]): string {
  if (!points.length) return side === "bull" ? `The reported numbers give little direct support for ${name} right now.` : `The reported numbers raise no specific red flags for ${name}.`;
  const lead = side === "bull" ? "The numbers on the bull side:" : "The numbers on the bear side:";
  return `${lead} ${points.slice(0, 2).map((p) => p.text).join(" ")}`;
}

export function rulesSide(side: "bull" | "bear", name: string, e: Evidence): Side {
  const points = e[side].map(({ text, refs }) => ({ text, refs }));
  return { statement: statementFor(side, name, points), points };
}

function stanceOf(bull: number, bear: number): Stance {
  if (bull - bear >= 2) return "Worth deeper research";
  if (bear - bull >= 2) return "Proceed with caution";
  return "Neutral";
}

const LEVELS: IcLevel[] = ["beginner", "intermediate", "advanced"];

// The chair's memo from whatever sides were argued (by Gemini or by rules) and the rules' own risk list.
export function rulesMemo(name: string, e: Evidence, bull: Side, bear: Side, assumptions: Assumption[], note = RULES_NOTE): Omit<IcMemo, "bull" | "bear"> {
  const stance = stanceOf(bull.points.length, bear.points.length);
  const counts = `${bull.points.length} point${bull.points.length === 1 ? "" : "s"} for and ${bear.points.length} against`;
  const topBull = bull.points[0]?.text ?? "";
  const topBear = bear.points[0]?.text ?? "";
  const statuses = assumptions.map((a) => `${a.id} ${a.status}`).join(", ");
  const summary: Record<IcLevel, string> = {
    beginner: `We checked ${name}'s reported numbers and found ${counts}. Overall: ${stance.toLowerCase()}; this is research, not a recommendation.`,
    intermediate: `${counts[0].toUpperCase()}${counts.slice(1)} from filings and market data. ${topBull ? `Strongest for: ${topBull}` : ""} ${topBear ? `Strongest against: ${topBear}` : ""}`.trim(),
    advanced: `${stance}. ${counts[0].toUpperCase()}${counts.slice(1)}${statuses ? `; assumptions ${statuses}` : ""}. ${e.fitLine}`.trim(),
  };
  for (const l of LEVELS) summary[l] = summary[l].replace(/\s+/g, " ");
  return {
    stance,
    summary,
    summarySource: { beginner: "rules", intermediate: "rules", advanced: "rules" },
    // A key risk cites the fact behind the bear point it came from.
    keyRisks: e.bear.flatMap((p) => (p.risk ? [{ text: p.risk, refs: p.refs }] : [])).slice(0, 4),
    watch: e.watch,
    chairNote: `${e.fitLine} ${note}`.trim(),
  };
}
