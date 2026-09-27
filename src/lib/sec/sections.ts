import type { SupportedFilingForm } from "./filings";

export type FilingSection = {
  name: string; item: string; part?: "I" | "II"; text: string; found: boolean;
  status: "found" | "incorporated-by-reference" | "not-found" | "unsupported";
  // Half-open offsets into htmlToText output; never offsets into raw HTML.
  start: number | null; end: number | null;
};
const TITLES: Record<string, string> = {
  "1": "(?:business|financial\\s+statements|legal\\s+proceedings)", "1A": "risk\\s+factors", "1B": "unresolved", "1C": "cybersecurity",
  "2": "(?:properties|management[’']?s\\s+discussion|unregistered)",
  "3": "(?:legal\\s+proceedings|quantitative|defaults)", "4": "(?:mine\\s+safety|controls)",
  "5": "(?:market\\s+for|other\\s+information)", "6": "(?:\\[?reserved|exhibits)",
  "7": "management[’']?s\\s+discussion", "7A": "quantitative", "8": "financial\\s+statements",
  "9": "changes\\s+in", "9A": "controls", "9B": "other\\s+information", "9C": "disclosure",
  "10": "directors", "11": "executive", "12": "security\\s+ownership", "13": "certain\\s+relationships",
  "14": "principal", "15": "exhibits?", "16": "form\\s+10-k",
};
const FOREIGN: Record<string, string> = {
  "1": "identity", "2": "offer\\s+statistics", "3": "key\\s+information", "4": "information\\s+on",
  "4A": "unresolved", "5": "operating\\s+and\\s+financial", "6": "directors", "7": "major\\s+shareholders",
  "8": "financial\\s+information", "9": "the\\s+offer", "10": "additional", "11": "quantitative", "12": "description", "12D": "description",
  "13": "defaults", "14": "material\\s+modifications", "15": "controls", "16A": "audit", "17": "financial", "18": "financial", "19": "exhibits",
};
const SEP = "\\s*\\.?\\s*[-–—:.]?\\s*";
function headers(text: string, form: SupportedFilingForm) {
  const base = form.replace(/\/A$/, "");
  const titles = base === "20-F" ? FOREIGN : TITLES;
  const expression = base === "8-K"
    ? "(?:[1-9]\\.\\d{2})(?![\\d])[^\\n]*"
    : Object.entries(titles).map(([item, title]) => `${item}${SEP}(?:${title})`).join("|");
  const re = new RegExp(`(?:^|\\n)[ \\t]*(?:PART\\s+(?:II|I)\\s*[-–—:.]?\\s*)?ITEM\\s*(${expression})`, "gi");
  return [...text.matchAll(re)].map(m => {
    const start = m.index + m[0].search(/ITEM/i);
    const item = /ITEM\s*(\d+(?:\.\d{2}|[A-Z])?)/i.exec(m[0])![1].toUpperCase();
    return { start, item, headingEnd: m.index + m[0].length };
  });
}
export function extractItem(text: string, form: SupportedFilingForm, item: string, part?: "I" | "II"): FilingSection {
  item = item.toUpperCase();
  const name = `${part ? `Part ${part}, ` : ""}Item ${item}`;
  const empty: FilingSection = { name, item, part, text: "", found: false, status: form.startsWith("40-F") ? "unsupported" : "not-found", start: null, end: null };
  if (empty.status === "unsupported") return empty; // 40-F has no standardized domestic item layout.
  const all = headers(text, form);
  let best: FilingSection | null = null;
  for (const h of all.filter(h => h.item === item)) {
    if (part) {
      const preceding = [...text.slice(0, h.headingEnd).matchAll(/(?:^|\n)\s*PART\s+(II|I)(?![IVX\w])/gi)].at(-1);
      if (!preceding || preceding[1].toUpperCase() !== part) continue;
    }
    const next = all.find(n => n.start > h.start && n.item !== item);
    if (!next && !form.startsWith("8-K")) continue; // An unbounded cross-reference is not a section.
    let end = next?.start ?? text.length;
    if (form.startsWith("8-K") && !next) {
      const sig = /(?:^|\n)\s*SIGNATURES\s*(?:\n|$)/i.exec(text.slice(h.headingEnd));
      if (sig) end = h.headingEnd + sig.index;
    }
    while (end > h.start && /\s/.test(text[end - 1])) end--;
    const body = text.slice(h.start, end);
    // TOC cells have heading + page number only; even a reference stub contains a sentence.
    if (body.length < 80 || !/[a-z][.!?](?:\s|$)/i.test(body)) continue;
    const incorporated = body.length < 2000 && /incorporat(?:ed|ion)[\s\S]*?(?:reference)|reference is made|(?:appears?|included|provided|discussed) on pages?\s+\d|(?:see|refer to)\s+[^.\n]{0,80}(?:information|discussion|section|item)/i.test(body);
    const candidate: FilingSection = { name, item, part, text: body, found: true, status: incorporated ? "incorporated-by-reference" : "found", start: h.start, end };
    if (!best || candidate.text.length > best.text.length) best = candidate;
  }
  return best ?? empty;
}
