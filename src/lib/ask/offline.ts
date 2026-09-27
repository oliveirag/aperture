// Pure: answers Ask questions straight from the portfolio JSON when Gemini is unavailable. It recognises the common
// questions (a company, biggest exposures, sectors, fund overlap, filing changes, committee memos, definitions) and
// quotes the page's own numbers; anything else gets an honest summary of what it can answer.
import { GLOSSARY } from "@/data/glossary";
import { formatPct, formatUSD } from "@/lib/format";
import { DISCLAIMER } from "./prompt";

type Exposure = { ticker: string; name: string; valueUsd: number; weight: number; paths: { via: string; weight: number }[] };
type Context = {
  portfolio?: { kind?: string; totalValueUsd?: number; positionsCount?: number; underlyingCompanies?: number; positions?: { ticker: string; name?: string; category?: string; valueUsd: number; weight: number }[] };
  apertureTop10?: Exposure[];
  sectors?: { sector: string; weight: number }[];
  concentrationFlags?: { label: string; weight: number }[];
  etfOverlaps?: { a: string; b: string; overlapByWeight: number; sharedCompanies: number }[];
  filingRadar?: { ticker: string; company: string; severity: string; change: string; filing: string; apertureWeight: number }[];
  icMemos?: { ticker: string; date: string; memo: { stance: string; summary: Record<string, string>; keyRisks?: { text: string }[] } }[];
};

// A stress test Aperture already calculated, as the Ask store sends it alongside the portfolio.
type Scenario = {
  question: string;
  assumption: string;
  evidence?: { text: string }[];
  impacts?: { ticker: string; returnFraction: number; dollar: number; path?: string }[];
  modeledShare?: number;
  notModeled?: (string | { ticker: string; weight: number })[];
};

const NOTE = "Answered directly from your portfolio data; the AI assistant is unavailable right now.";
const pct = (w: number) => formatPct(w);
const isDirect = (v: string) => v.toLowerCase() === "direct";
const via = (p: { via: string; weight: number }) => `${isDirect(p.via) ? "held directly" : `through ${p.via}`} ${pct(p.weight)}`;

function exposureLine(e: Exposure) {
  const paths = e.paths.length ? `: ${e.paths.map(via).join(", ")}` : "";
  return `${e.name} (${e.ticker}) is ${pct(e.weight)} of your money, ${formatUSD(e.valueUsd)}${paths}.`;
}

function findCompany(q: string, c: Context) {
  const words = new Set(q.toUpperCase().match(/\b[A-Z]{1,5}(?:\.[A-Z])?\b/g) ?? []);
  const lower = q.toLowerCase();
  const named = (name?: string) => !!name && name.length > 2 && lower.includes(name.toLowerCase().split(/[ ,]/)[0]);
  const exposure = c.apertureTop10?.find((e) => (words.has(e.ticker) && e.ticker.length > 1) || named(e.name));
  const position = c.portfolio?.positions?.find((p) => (words.has(p.ticker) && p.ticker.length > 1) || named(p.name));
  const ticker = exposure?.ticker ?? position?.ticker;
  if (!ticker) return null;
  return {
    ticker,
    exposure,
    position,
    radar: c.filingRadar?.find((r) => r.ticker === ticker),
    memo: c.icMemos?.find((m) => m.ticker === ticker),
  };
}

function glossaryAnswer(q: string, c: Context) {
  if (!/\b(what('?s| is| are| does)|define|meaning|mean)\b/i.test(q)) return null;
  const hit = (Object.keys(GLOSSARY) as (keyof typeof GLOSSARY)[]).find((t) => new RegExp(`\\b${t.replace(/[-]/g, "[- ]")}s?\\b`, "i").test(q));
  if (!hit) return null;
  const lines: string[] = [GLOSSARY[hit]];
  if (hit === "ETF") {
    const viaFunds = c.apertureTop10?.flatMap((e) => e.paths.map((p) => p.via)).filter((v) => !isDirect(v)) ?? [];
    const named = c.portfolio?.positions?.filter((p) => /\b(ETF|fund|trust)\b/i.test(`${p.name ?? ""} ${p.category ?? ""}`)).map((p) => p.ticker) ?? [];
    const unique = [...new Set([...viaFunds, ...named])];
    if (unique.length) lines.push(`In your portfolio: ${unique.join(", ")}.`);
  }
  if (hit === "concentration" && c.concentrationFlags?.length) lines.push(`Your flags: ${c.concentrationFlags.map((f) => `${f.label} ${pct(f.weight)}`).join("; ")}.`);
  if (hit === "overlap" && c.etfOverlaps?.length) {
    const o = c.etfOverlaps[0];
    lines.push(`Your largest: ${o.a} and ${o.b} overlap ${pct(o.overlapByWeight)} by weight, ${o.sharedCompanies} shared companies.`);
  }
  return lines.join("\n\n");
}

// The chain from assumption to holdings, from the calculated scenario's own numbers.
function scenarioAnswer(sc: Scenario, c: Context) {
  const impacts = [...(sc.impacts ?? [])].sort((a, b) => Math.abs(b.dollar) - Math.abs(a.dollar));
  const dollars = impacts.reduce((sum, i) => sum + i.dollar, 0);
  const total = c.portfolio?.totalValueUsd;
  const signed = (n: number) => `${n < 0 ? "−" : "+"}${formatUSD(Math.abs(n))}`;
  const lines = [sc.assumption];
  if (impacts.length) {
    lines.push(`Calculated effect: ${signed(dollars)}${total ? ` (${formatPct(dollars / total)} of your portfolio)` : ""}. Largest moves:`);
    for (const i of impacts.slice(0, 4)) lines.push(`- ${i.ticker}: ${formatPct(i.returnFraction)} (${signed(i.dollar)})${i.path ? `, via ${i.path}` : ""}`);
  }
  if (sc.notModeled?.length) lines.push(`Not modeled: ${sc.notModeled.map(item => typeof item === "string" ? item : `${item.ticker} (${pct(item.weight)} of your portfolio)`).join(", ")}. Their risk is unknown, not zero.`);
  if (sc.evidence?.length) lines.push(`Evidence: ${sc.evidence[0].text}`);
  lines.push("The size and sensitivities are assumptions, not forecasts. Open the scenario graph to change the size.");
  return lines.join("\n");
}

export function answerFromData(question: string, context: unknown): string {
  const raw = (context && typeof context === "object" ? context : {}) as { portfolio?: unknown; scenario?: Scenario };
  // Scenario questions arrive as { portfolio: <portfolio context>, scenario }.
  if (raw.scenario) {
    const inner = (raw.portfolio && typeof raw.portfolio === "object" ? raw.portfolio : {}) as Context;
    return `${scenarioAnswer(raw.scenario, inner)}\n\n${NOTE}\n${DISCLAIMER}`;
  }
  const c = raw as Context;
  const q = question.trim();
  const total = c.portfolio?.totalValueUsd;
  const top = c.apertureTop10 ?? [];
  let body: string | null = glossaryAnswer(q, c);

  const company = body ? null : findCompany(q, c);
  if (!body && company) {
    const lines = [
      company.exposure
        ? exposureLine(company.exposure)
        : company.position
          ? `${company.position.name ?? company.ticker} is ${pct(company.position.weight)} of your money, ${formatUSD(company.position.valueUsd)}.`
          : "",
    ];
    if (company.radar) lines.push(`Filing Radar (${company.radar.filing}, ${company.radar.severity}): ${company.radar.change}.`);
    if (company.memo) lines.push(`IC Room memo from ${company.memo.date}: ${company.memo.memo.stance}. ${company.memo.memo.summary.intermediate ?? ""}`.trim());
    body = lines.filter(Boolean).join("\n\n");
  }

  if (!body && /\b(sector|industr)/i.test(q) && c.sectors?.length) {
    body = ["Your look-through sectors:", ...c.sectors.slice(0, 6).map((s) => `- ${s.sector}: ${pct(s.weight)}`)].join("\n");
  }
  if (!body && /\b(overlap|double|duplicate|same compan)/i.test(q) && c.etfOverlaps?.length) {
    body = ["Where your funds hold the same companies:", ...c.etfOverlaps.slice(0, 4).map((o) => `- ${o.a} and ${o.b}: ${pct(o.overlapByWeight)} overlap by weight, ${o.sharedCompanies} shared companies`)].join("\n");
  }
  if (!body && /\b(filing|10-?k|10-?q|radar|risk factor|disclos|changed)\b/i.test(q) && c.filingRadar?.length) {
    body = ["Latest filing changes for companies you own:", ...c.filingRadar.slice(0, 5).map((r) => `- ${r.company} (${r.severity}, ${pct(r.apertureWeight)} of your money): ${r.change}`)].join("\n");
  }
  if (!body && /\b(committee|memo|ic room|bull|bear|thesis)\b/i.test(q) && c.icMemos?.length) {
    body = c.icMemos.map((m) => `${m.ticker} (${m.date}): ${m.memo.stance}. ${m.memo.summary.intermediate ?? ""}`.trim()).join("\n\n");
  }
  if (!body && /\b(biggest|largest|top|most|exposure|concentrat|own|hold|risk|diversif)/i.test(q) && top.length) {
    const flags = c.concentrationFlags?.length ? `\n\nConcentration flags: ${c.concentrationFlags.map((f) => `${f.label} ${pct(f.weight)}`).join("; ")}.` : "";
    body = ["Your largest look-through exposures:", ...top.slice(0, 5).map((e) => `- ${exposureLine(e)}`)].join("\n") + flags;
  }
  if (!body && /\b(worth|value|total|how much)\b/i.test(q) && total) {
    body = `Your portfolio is worth ${formatUSD(total)} across ${c.portfolio?.positionsCount ?? 0} positions, which look through to ${c.portfolio?.underlyingCompanies ?? 0} companies.`;
  }
  if (!body) {
    const summary = total && top.length ? `Your portfolio is worth ${formatUSD(total)}; the largest look-through exposure is ${top[0].name} at ${pct(top[0].weight)}.` : "I don't have data on that.";
    body = `${summary}\n\nWithout the AI assistant I can answer questions about a company you own, your biggest exposures, sectors, fund overlap, filing changes, committee memos, and terms like ETF or look-through.`;
  }
  return `${body}\n\n${NOTE}\n${DISCLAIMER}`;
}
