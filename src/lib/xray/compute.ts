import { formatPct } from "@/lib/format";
import { assertProvenance, type Provenance } from "@/lib/provenance";
import { positionValue, portfolioValue, valuationEvidence } from "./valuation";
import { sectorFromIndustry, sectorFromSic, type SectorLabel } from "@/lib/sectors";
import type { Flag, LeveledText, SectorSlice, Source } from "@/types/demo";
import type { Connector, MapExposure, MapPosition, XExposure, XOverlap, XrayModel, XSource } from "./types";

export const COMPANY_THRESHOLD = 0.1;
export const SECTOR_THRESHOLD = 0.35;

// Right-hand rows on the map before "Everything else", and left-hand rows before "Other positions".
const MAP_COMPANIES = 5;
const MAP_POSITIONS = 8;
// Sector slices before the rest fold into "Other" (the donut has eight colors).
const MAX_SECTORS = 8;

const PALETTE = ["#76B900", "#B4B4BC", "#5B9BD5", "#C9A66B", "#E2A15B", "#CC7A52", "#6C8EBF", "#8AA86B", "#9AA0A6", "#9C8C6E", "#D98C6A", "#7FB8A4"];

export type ApertureInput = {
  ticker: string;
  name: string;
  shares: number;
  price: number;
  // A stock (with its Finnhub industry), an ETF with holdings, or an ETF/unknown we can't see into.
  kind: "stock" | "etf" | "opaque" | "cash";
  industry?: string | null;
  sic?: number | null;
  marketValue?: number;
  provenance?: Provenance;
  sector?: SectorLabel;
  sectorProvenance?: Provenance;
  etf?: {
    holdings: { ticker: string; name: string; weight: number }[];
    sectors: { sector: SectorLabel; weight: number }[];
    asOf: string;
    provenance?: Provenance;
    holdingsSource?: { name: string; url?: string };
    exclusions?: { name: string; weight: number; kind: string }[];
  };
};

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const word = (n: number) => WORDS[n] ?? String(n);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// "NVIDIA Corp" -> "NVIDIA", "JPMorgan Chase & Co" -> "JPMorgan Chase", "Alphabet Inc Class A" -> "Alphabet".
const SUFFIX = /[\s,]+(inc|corp|corporation|co|company|ltd|limited|plc|holdings|group|n\.?v|s\.?a|ag|se|class [a-c]|cl [a-c]|&)\.?$/i;
export function cleanName(name: string) {
  let out = name.trim();
  for (let prev = ""; prev !== out; ) {
    prev = out;
    out = out.replace(SUFFIX, "").trim();
  }
  return out || name;
}

function colorFor(ticker: string, known: Map<string, string>) {
  const c = known.get(ticker);
  if (c) return c;
  let h = 0;
  for (const ch of ticker) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function joinNames(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// Headline and subline, written from the computed numbers only.
function copy(total: number, top: XExposure[], flags: Flag[], sectors: SectorSlice[], overlaps: XOverlap[], positionsCount: number) {
  const lead = top[0];
  if (!lead) {
    const headline = "This portfolio has no disclosed equity exposure.";
    const subline = "Cash and non-equity holdings remain in portfolio value. See the exposure summary for details.";
    return {headline:{beginner:headline,intermediate:headline,advanced:headline},subline:{beginner:subline,intermediate:subline,advanced:subline}};
  }
  const w = lead.value / total;
  const pct = formatPct(w);
  const paths = lead.sources.length;
  const direct = lead.sources.find((s) => s.via === "Direct");
  const breakdown = lead.sources.map((s) => `${formatPct(s.value / total)} ${s.via === "Direct" ? "direct" : `via ${s.via}`}`).join(", ");
  const oneIn = Math.max(2, Math.round(1 / w));

  const headline: LeveledText =
    paths > 1
      ? {
          beginner: `About $1 of every $${oneIn} you've invested is tied to ${lead.name}, even though it ${direct ? "looks like one holding" : "isn't something you bought directly"}.`,
          intermediate: `${lead.name} isn't one position. It's ${word(paths)}, and ${pct} of your money.`,
          advanced: `${lead.ticker} is ${pct} of look-through exposure: ${breakdown}.`,
        }
      : {
          beginner: `About $1 of every $${oneIn} you've invested is in ${lead.name}.`,
          intermediate: `${lead.name} is your biggest exposure at ${pct} of your money.`,
          advanced: `${lead.ticker} is the largest look-through exposure at ${pct} (${breakdown}).`,
        };

  const companyFlags = flags.filter((f) => f.kind === "company");
  const sectorFlag = flags.find((f) => f.kind === "sector");
  const multi = top.filter((e) => e.sources.length > 1).slice(0, 3).map((e) => e.name);
  const topOverlap = overlaps[0];

  const concentration =
    companyFlags.length > 0
      ? `${capital(word(companyFlags.length))} ${companyFlags.length === 1 ? "company is" : "companies are each"} more than 10% of your money.`
      : "No single company is more than 10% of your money.";

  const subline: LeveledText = {
    beginner:
      multi.length > 0
        ? `ETFs are baskets of companies. ${joinNames(multi)} ${multi.length === 1 ? "reaches" : "each reach"} you through more than one of your holdings, so the same companies show up again and again.`
        : `You own ${positionsCount} ${positionsCount === 1 ? "position" : "positions"}. Look-through adds up every company inside your ETFs so you see your real exposure.`,
    intermediate:
      multi.length > 0 ? `Your ETFs quietly hold the companies you already own directly. ${concentration}` : concentration,
    advanced: [
      `${companyFlags.length} single ${companyFlags.length === 1 ? "name exceeds" : "names exceed"} the 10% threshold.`,
      sectorFlag
        ? `${sectorFlag.label} is ${formatPct(sectorFlag.weight)} of look-through value vs a 35% limit.`
        : `Largest sector: ${sectors[0]?.sector ?? "n/a"} at ${formatPct(sectors[0]?.weight ?? 0)}.`,
      topOverlap && topOverlap.overlap > 0 ? `${topOverlap.a} and ${topOverlap.b} overlap ${formatPct(topOverlap.overlap, 0)} by weight.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
  return { headline, subline };
}

// Builds the map: positions on the left, the biggest exposures plus "Everything else" on the right.
function buildMap(positions: MapPosition[], exposures: XExposure[], total: number) {
  const shown = positions.slice(0, positions.length > MAP_POSITIONS ? MAP_POSITIONS - 1 : MAP_POSITIONS);
  const grouped = positions.slice(shown.length);
  const OTHERS = "others";
  const leftId = (ticker: string) => (grouped.some((p) => p.ticker === ticker) ? OTHERS : ticker);
  const left: MapPosition[] = grouped.length
    ? [
        ...shown,
        {
          id: OTHERS,
          ticker: `+${grouped.length}`,
          category: `${grouped.length} smaller positions`,
          value: grouped.reduce((s, p) => s + p.value, 0),
          weight: grouped.reduce((s, p) => s + p.weight, 0),
          color: "#9AA0A6",
        },
      ]
    : shown;

  const named = exposures.slice(0, MAP_COMPANIES);
  const links = new Map<string, Connector>();
  const add = (from: string, to: string, value: number, etf: boolean) => {
    const id = `${from}-${to}`;
    const prev = links.get(id);
    links.set(id, { id, from, to, value: (prev?.value ?? 0) + value, etf: prev?.etf ?? etf });
  };

  const contributed = new Map<string, number>();
  for (const e of named) {
    for (const s of e.sources) {
      const position = s.via === "Direct" ? e.ticker : s.via;
      contributed.set(position, (contributed.get(position) ?? 0) + s.value);
      add(leftId(position), e.ticker, s.value, s.via !== "Direct");
    }
  }

  // Whatever each position holds beyond the named companies.
  const REST = "rest";
  const restSources: XSource[] = [];
  for (const p of positions) {
    const rest = p.value - (contributed.get(p.ticker) ?? 0);
    if (rest <= 0) continue;
    restSources.push({ via: p.ticker, value: rest });
    add(leftId(p.ticker), REST, rest, true);
  }

  const connectors = [...links.values()].filter((c) => c.value > 0);
  const namedValue = named.reduce((s, e) => s + e.value, 0);
  const restValue = total - namedValue;
  const restCompanies = Math.max(0, exposures.length - named.length);

  const right: MapExposure[] = named.map((e) => ({
    id: e.ticker,
    name: e.name,
    ticker: e.ticker,
    color: e.color,
    value: e.value,
    weight: e.value / total,
    sources: e.sources,
  }));
  if (restValue > 0) {
    right.push({
      id: REST,
      name: "Everything else",
      note: restCompanies > 0 ? `${restCompanies.toLocaleString("en-US")} more companies` : undefined,
      value: restValue,
      weight: restValue / total,
      sources: restSources,
    });
  }

  const drawOrder = [...connectors.filter((c) => c.etf), ...connectors.filter((c) => !c.etf)].map((c) => c.id);
  return {
    positions: left,
    exposures: right,
    connectors,
    drawOrder,
    pinId: named[0]?.ticker ?? REST,
    maxPosition: Math.max(...left.map((p) => p.value), 1),
  };
}

// The real look-through for any portfolio. Pure: every number comes from the inputs.
// `names` overrides company names (proper Finnhub names for companies only seen inside ETFs).
export function computeXray(
  inputs: ApertureInput[],
  knownColors: Map<string, string> = new Map(),
  names: Map<string, string> = new Map(),
): XrayModel {
  for (const input of inputs) {
    for (const evidence of [input.provenance, input.sectorProvenance, input.etf?.provenance]) if (evidence !== undefined) assertProvenance(evidence);
  }
  const total = portfolioValue(inputs);
  const rows = inputs.filter((p) => positionValue(p) > 0).map(p => {
    if (!p.etf) return p;
    const validWeights = (weights: number[]) => weights.every(w => Number.isFinite(w) && w >= 0) && weights.reduce((s, w) => s + w, 0) <= 1 + 1e-10;
    if (!validWeights([...p.etf.holdings, ...(p.etf.exclusions ?? [])].map(h => h.weight)) || !validWeights(p.etf.sectors.map(s => s.weight))) throw new Error(`Invalid ETF weights for ${p.ticker}; exposure cannot exceed portfolio value.`);
    const merged = new Map<string, { ticker: string; name: string; weight: number }>();
    for (const h of p.etf.holdings) {
      if (h.weight === 0) continue;
      const previous = merged.get(h.ticker);
      merged.set(h.ticker, { ...h, weight: (previous?.weight ?? 0) + h.weight });
    }
    return { ...p, etf: { ...p.etf, holdings: [...merged.values()] } };
  });

  const exposures = new Map<string, { name: string; sources: Map<string, number> }>();
  const addExposure = (ticker: string, name: string, via: string, value: number) => {
    const e = exposures.get(ticker) ?? { name: cleanName(name), sources: new Map<string, number>() };
    // A company held directly keeps its own (Finnhub) name over the fund's description.
    if (via === "Direct") e.name = cleanName(name);
    e.sources.set(via, (e.sources.get(via) ?? 0) + value);
    exposures.set(ticker, e);
  };

  const sectors = new Map<SectorLabel, number>();
  const addSector = (s: SectorLabel, v: number) => sectors.set(s, (sectors.get(s) ?? 0) + v);

  const positions: MapPosition[] = [];
  const opaque: string[] = [];
  const sources: Source[] = [];

  for (const p of rows) {
    const value = positionValue(p);
    const color = colorFor(p.ticker, knownColors);
    if (p.kind === "cash") {
      addSector("Other", value);
      positions.push({ id:p.ticker,ticker:p.ticker,category:"USD cash",value,weight:value/total,color });
    } else if (p.kind === "etf" && p.etf) {
      let covered = 0;
      for (const h of p.etf.holdings) {
        addExposure(h.ticker, h.name, p.ticker, value * h.weight);
        covered += h.weight;
      }
      // Cash, futures and rounding the fund reports without a ticker.
      if (covered < 1) addExposure(`${p.ticker}·other`, `${p.ticker} cash & other`, p.ticker, value * (1 - covered));
      let sectorCovered = 0;
      for (const s of p.etf.sectors) {
        addSector(s.sector, value * s.weight);
        sectorCovered += s.weight;
      }
      if (sectorCovered < 1) addSector("Other", value * (1 - sectorCovered));
      positions.push({ id: p.ticker, ticker: p.ticker, category: `ETF · ${p.etf.holdings.length} holdings`, value, weight: value / total, color });
      const top = p.etf.holdings.slice(0, 5);
      const sourceUrl = p.etf.holdingsSource?.url ?? (p.etf.provenance?.kind === "retrieved" ? p.etf.provenance.endpoint : undefined);
      if (sourceUrl) sources.push({
        id: `s-${p.ticker.toLowerCase()}-holdings`,
        title: `${p.name} (${p.ticker}) holdings`,
        docType: "ETF holdings",
        issuer: p.etf.holdingsSource?.name ?? (p.etf.provenance?.kind === "retrieved" ? p.etf.provenance.provider : "Holdings source unavailable"),
        date: p.etf.asOf,
        excerpt: `Top holdings: ${top.map((h) => `${h.name} ${formatPct(h.weight)}`).join(", ")}. ${p.etf.holdings.length} holdings.`,
        highlight: top[0] ? `${top[0].name} ${formatPct(top[0].weight)}` : undefined,
        url: sourceUrl,
      });
    } else {
      const unavailable = p.kind === "opaque" || p.kind === "etf";
      // An unsupported security is not a disclosed underlying company.
      if (!unavailable) addExposure(p.ticker, p.name, "Direct", value);
      if (unavailable) {
        opaque.push(p.ticker);
        addSector("Other", value);
      } else {
        const industrySector = sectorFromIndustry(p.industry);
        addSector(p.sector ?? (industrySector === "Other" ? sectorFromSic(p.sic) : industrySector), value);
      }
      const category = unavailable ? "Look-through unavailable · value retained" : (p.industry ?? "");
      positions.push({ id: p.ticker, ticker: p.ticker, category, value, weight: value / total, color });
    }
  }
  positions.sort((a, b) => b.value - a.value);

  const all: XExposure[] = [...exposures]
    .filter(([ticker]) => !ticker.includes("·"))
    .map(([ticker, e]) => {
      const list = [...e.sources].map(([via, value]) => ({ via, value }));
      // Direct first, then funds by size.
      list.sort((a, b) => (a.via === "Direct" ? -1 : b.via === "Direct" ? 1 : b.value - a.value));
      const name = names.has(ticker) ? cleanName(names.get(ticker)!) : e.name;
      return { ticker, name, color: colorFor(ticker, knownColors), value: list.reduce((s, x) => s + x.value, 0), sources: list };
    })
    .sort((a, b) => b.value - a.value);

  // Sectors: largest first, "Other" (and anything past the eighth slice) folded at the end.
  const sorted = [...sectors].filter(([s, v]) => s !== "Other" && v > 0).sort((a, b) => b[1] - a[1]);
  const kept = sorted.slice(0, MAX_SECTORS - 1);
  const otherValue = total - kept.reduce((s, [, v]) => s + v, 0);
  const sectorSlices: SectorSlice[] = kept.map(([sector, v]) => ({ sector, weight: v / total }));
  if (otherValue > 0 && total > 0) sectorSlices.push({ sector: "Other", weight: otherValue / total });

  // Weighted overlap between every pair of ETFs we can see into.
  const etfs = rows.filter((p) => p.kind === "etf" && p.etf);
  const overlaps: XOverlap[] = [];
  for (let i = 0; i < etfs.length; i++) {
    for (let j = i + 1; j < etfs.length; j++) {
      const [a, b] = positionValue(etfs[i]) >= positionValue(etfs[j]) ? [etfs[i], etfs[j]] : [etfs[j], etfs[i]];
      const wa = new Map(a.etf!.holdings.map((h) => [h.ticker, h.weight]));
      let overlap = 0;
      let shared = 0;
      for (const h of b.etf!.holdings) {
        const w = wa.get(h.ticker);
        if (w === undefined) continue;
        overlap += Math.min(w, h.weight);
        shared++;
      }
      overlaps.push({
        a: a.ticker,
        b: b.ticker,
        overlap,
        sharedCompanies: shared,
        aValue: positionValue(a),
        bValue: positionValue(b),
        bCount: b.etf!.holdings.length,
      });
    }
  }
  overlaps.sort((x, y) => y.overlap - x.overlap);

  const flags: Flag[] = [
    ...all
      .filter((e) => e.value / total > COMPANY_THRESHOLD)
      .map((e) => ({ id: `f-${e.ticker.toLowerCase()}`, kind: "company" as const, label: e.name, weight: e.value / total, threshold: COMPANY_THRESHOLD })),
    ...sectorSlices
      .filter((s) => s.sector !== "Other" && s.weight > SECTOR_THRESHOLD)
      .map((s) => ({ id: `f-${s.sector.toLowerCase().replace(/\W+/g, "-")}`, kind: "sector" as const, label: s.sector, weight: s.weight, threshold: SECTOR_THRESHOLD })),
  ];

  const topTen = all.slice(0, 10);
  const etfColumns = [...etfs].sort((a, b) => positionValue(b) - positionValue(a)).slice(0, 3).map((p) => p.ticker);
  const text = copy(total, all, flags, sectorSlices, overlaps, rows.length);

  return {
    mode: "live",
    total,
    valuation: {
      currency: "USD", total,
      positions: rows.map(p => ({ ticker: p.ticker, shares: p.shares, price: p.price, value: positionValue(p), kind: p.kind, provenance: p.provenance })),
      provenance: rows.length && rows.every(p => p.provenance) ? valuationEvidence(rows.map(p => p.provenance!)) : undefined,
      status: rows.every(p => p.provenance) && rows.length ? "sourced" : "source-unavailable",
    },
    positionsCount: rows.length,
    underlyingCompanies: all.length,
    headline: text.headline,
    subline: text.subline,
    map: buildMap(positions, all, total),
    topTen,
    etfColumns,
    sectors: sectorSlices,
    sectorSources: rows.map(p => {
      const unavailable = p.kind === "opaque" || (p.kind === "etf" && !p.etf);
      const evidence = unavailable ? undefined : p.kind === "cash" ? p.provenance : p.etf?.provenance ?? p.sectorProvenance;
      const method = unavailable ? "Unsupported exposure retained in Other" : p.kind === "cash" ? "Reviewed cash retained in Other" : p.etf ? "Reported ETF sector weights; undisclosed residual retained in Other" : p.sector ? "Source-supplied sector" : sectorFromIndustry(p.industry) !== "Other" ? "Finnhub industry keyword crosswalk (not official GICS)" : p.sic ? "Conservative SEC SIC crosswalk (not official GICS)" : "Sector unavailable; retained in Other";
      return { ticker:p.ticker, method, provenance: evidence ? {kind:"computed" as const,formula:method,inputs:[evidence]} : undefined,status: evidence ? "sourced" as const : "source-unavailable" as const };
    }),
    overlaps,
    flags,
    sources,
    opaque,
  };
}
