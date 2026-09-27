import type { RetrievedProvenance } from "@/lib/provenance";

// Keep the original default Filing contract for existing Radar/Source consumers.
export type FilingForm = "10-K" | "10-Q";
export const SUPPORTED_FORMS = ["10-K", "10-Q", "8-K", "20-F", "40-F", "10-K/A", "10-Q/A", "8-K/A", "20-F/A", "40-F/A"] as const;
export type SupportedFilingForm = typeof SUPPORTED_FORMS[number];
export interface Filing<F extends SupportedFilingForm = FilingForm> {
  form: F;
  accession: string;
  filedAt: string;
  reportDate: string;
  url: string;
  indexUrl: string;
}
export type SecFiling = Filing<SupportedFilingForm> & { items: string[]; primaryDocument: string; provenance: RetrievedProvenance };
export type Retrieval = { endpoint: string; retrievedAt: string };
export type SubmissionRows = { form: string[]; accessionNumber: string[]; filingDate: string[]; reportDate?: string[]; primaryDocument: string[]; items?: string[] };
export type Submissions = { filings?: { recent?: SubmissionRows; files?: { name: string }[] } };

export function normalizeCik(cik: string): string {
  if (!/^\d{1,10}$/.test(cik) || Number(cik) === 0) throw new Error("Invalid SEC CIK");
  return cik.padStart(10, "0");
}
export function filingIndexUrl(cik: string, accession: string) {
  normalizeCik(cik);
  if (!/^\d{10}-\d{2}-\d{6}$/.test(accession)) throw new Error("Invalid SEC accession");
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, "")}/${accession}-index.htm`;
}
export function parseFilings(rows: SubmissionRows, cik: string, retrieval: Retrieval): SecFiling[] {
  normalizeCik(cik);
  if (!rows || !Array.isArray(rows.form)) throw new Error("Invalid SEC submission rows");
  const out: SecFiling[] = [];
  for (let i = 0; i < rows.form.length; i++) {
    const form = rows.form[i] as SupportedFilingForm;
    if (!(SUPPORTED_FORMS as readonly string[]).includes(form)) continue;
    const accession = rows.accessionNumber[i];
    const primaryDocument = rows.primaryDocument[i];
    const filedAt = rows.filingDate[i];
    if (!/^\d{10}-\d{2}-\d{6}$/.test(accession) || !/^\d{4}-\d{2}-\d{2}$/.test(filedAt)) throw new Error("Invalid SEC filing identity");
    // Some historical submissions lack a primary document: keep the filing in history,
    // link to its index, and do not pretend the index is filing text.
    if (primaryDocument && (!/^[\w.-]+$/.test(primaryDocument) || primaryDocument.includes(".."))) throw new Error("Invalid SEC document name");
    const indexUrl = filingIndexUrl(cik, accession);
    const url = primaryDocument ? `${indexUrl.slice(0, indexUrl.lastIndexOf("/") + 1)}${primaryDocument}` : indexUrl;
    out.push({ form, accession, filedAt, reportDate: rows.reportDate?.[i] ?? "", primaryDocument: primaryDocument ?? "", url, indexUrl,
      items: (rows.items?.[i] ?? "").match(/\d{1,2}\.\d{2}/g) ?? [],
      provenance: { kind: "retrieved", provider: "sec-edgar", endpoint: retrieval.endpoint, retrievedAt: retrieval.retrievedAt, asOf: filedAt, filing: { cik, accession, form, filedAt, url } },
    });
  }
  return dedupeFilings(out);
}
export function dedupeFilings(filings: SecFiling[]): SecFiling[] {
  const byAccession = new Map<string, SecFiling>();
  const completeness = (f: SecFiling) => Number(!!f.primaryDocument) * 4 + Number(!!f.items.length) * 2 + Number(!!f.reportDate);
  for (const filing of filings) {
    const old = byAccession.get(filing.accession);
    if (!old || completeness(filing) > completeness(old)) byAccession.set(filing.accession, filing);
  }
  return [...byAccession.values()].sort((a, b) => b.filedAt.localeCompare(a.filedAt) || b.accession.localeCompare(a.accession));
}
// Compare distinct reporting periods, never an amendment against its original.
// Annual risk comparisons deliberately exclude amendments: many contain only exhibits.
export function latestFilingPair(filings: SecFiling[], form: SupportedFilingForm): { latest: SecFiling; prior: SecFiling } | null {
  const same = dedupeFilings(filings).filter(f => f.form === form);
  const latest = same[0];
  const prior = latest && same.slice(1).find(f => !latest.reportDate || f.reportDate !== latest.reportDate);
  return latest && prior ? { latest, prior } : null;
}
