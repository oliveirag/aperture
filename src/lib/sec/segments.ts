import type { RetrievedProvenance } from "@/lib/provenance";
import type { SecFiling, Retrieval } from "./filings";

export type SegmentRevenue = {
  tag: string; contextId: string; dimensions: { axis: string; member: string }[];
  unit: string; start: string; end: string; value: number;
  accession: string; form: string; provenance: RetrievedProvenance;
};
const attributes = (tag: string) => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(m => [m[1].toLowerCase(), m[2]]));
const element = (xml: string, name: string) => new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([^<]+)<\\/(?:[\\w-]+:)?${name}>`, "i").exec(xml)?.[1].trim();
const validDate = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s));
const REVENUE = /:(?:RevenueFromContractWithCustomer(?:ExcludingAssessedTax|IncludingAssessedTax)|Revenues|Revenue|SalesRevenueNet|RevenuesNetOfInterestExpense)$/i;
const DIMENSION = /(?:BusinessSegments|Geograph(?:ical|ic)|Geography|ProductsAndServices|ProductOrService|OperatingSegments)Axis$/i;
// Read only genuinely tagged revenue facts with explicit segment/geographic/product contexts.
// This deliberately does not infer allocations from tables, prose, customer addresses or companyfacts totals.
export function parseSegmentRevenue(html: string, filing: SecFiling, retrieval: Retrieval) {
  const contexts = new Map<string, { start: string; end: string; dimensions: SegmentRevenue["dimensions"] }>();
  for (const m of html.matchAll(/<(?:[\w-]+:)?context\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?context>/gi)) {
    const id = attributes(m[1]).id;
    const start = element(m[2], "startDate");
    const end = element(m[2], "endDate");
    const dimensions = [...m[2].matchAll(/<(?:[\w-]+:)?explicitMember\b([^>]*)>([^<]+)<\/(?:[\w-]+:)?explicitMember>/gi)]
      .map(d => ({ axis: attributes(d[1]).dimension, member: d[2].trim() }));
    // Mixed contexts are retained in full so a product × region intersection is not mislabeled a regional total.
    if (id && validDate(start) && validDate(end) && start <= end && dimensions.every(d => d.axis && d.member) && dimensions.some(d => DIMENSION.test(d.axis))) contexts.set(id, { start, end, dimensions });
  }
  const units = new Map<string, string>();
  for (const m of html.matchAll(/<(?:[\w-]+:)?unit\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?unit>/gi)) {
    const measure = element(m[2], "measure");
    if (measure && !/<(?:[\w-]+:)?divide\b/i.test(m[2])) units.set(attributes(m[1]).id, measure.replace(/^iso4217:/, ""));
  }
  const facts = new Map<string, SegmentRevenue>();
  const conflicted = new Set<string>();
  let unsupported = 0;
  for (const m of html.matchAll(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi)) {
    const a = attributes(m[1]);
    if (!REVENUE.test(a.name ?? "")) continue;
    const context = contexts.get(a.contextref);
    if (!context) continue;
    const unit = units.get(a.unitref);
    const raw = m[2].replace(/<[^>]*>/g, "").replace(/&#160;|&nbsp;/g, " ").trim();
    const format = (a.format ?? "").split(":").at(-1)!.toLowerCase();
    if (!unit || a.continuedat || a["xsi:nil"] === "true" || !["", "num-dot-decimal", "numdotdecimal", "num-comma-decimal", "numcommadecimal", "numdash", "zerodash", "fixed-zero"].includes(format)) { unsupported++; continue; }
    let numeric = format.includes("comma-decimal") || format === "numcommadecimal" ? raw.replace(/[.\s]/g, "").replace(",", ".") : raw.replace(/[,\s]/g, "");
    if (["numdash", "zerodash", "fixed-zero"].includes(format) && /^[-–—]$/.test(numeric)) numeric = "0";
    if (!/^-?\d+(?:\.\d+)?$/.test(numeric) || !/^-?\d{1,2}$/.test(a.scale ?? "0") || ![undefined, "-", "+"].includes(a.sign)) { unsupported++; continue; }
    const value = Number(numeric) * 10 ** Number(a.scale ?? 0) * (a.sign === "-" ? -1 : 1);
    if (!Number.isFinite(value)) { unsupported++; continue; }
    const key = [a.name, unit, context.start, context.end, ...context.dimensions.map(d => `${d.axis}=${d.member}`).sort()].join("|");
    if (facts.has(key) && facts.get(key)!.value !== value) conflicted.add(key);
    facts.set(key, { tag: a.name, contextId: a.contextref, ...context, unit, value, accession: filing.accession, form: filing.form,
      provenance: { kind: "retrieved", provider: "sec-edgar", endpoint: retrieval.endpoint, retrievedAt: retrieval.retrievedAt, asOf: context.end,
        filing: { cik: filing.provenance.filing!.cik, accession: filing.accession, form: filing.form, filedAt: filing.filedAt, url: filing.url, tag: a.name, section: `Inline XBRL context ${a.contextref}` } },
    });
  }
  for (const key of conflicted) facts.delete(key);
  const values = [...facts.values()];
  return { status: values.length ? "available" as const : "unavailable" as const, facts: values,
    note: "Only explicit tagged dimensions; overlapping axes are not additive. No inferred segment/geographic exposure.", unsupportedFacts: unsupported, conflictingFacts: conflicted.size };
}
