import { normalizeCik, parseFilings, SUPPORTED_FORMS, type Retrieval, type SupportedFilingForm } from "./filings";

export type FilingSearchQuery = { query: string; ciks: string[]; forms?: SupportedFilingForm[]; startDate: string; endDate: string; offset?: number };
export function filingSearchUrl(options: FilingSearchQuery) {
  if (!options.query.trim() || options.query.length > 200 || options.ciks.length < 1 || options.ciks.length > 100) throw new Error("SEC search needs a bounded query and 1–100 CIKs");
  if (![options.startDate, options.endDate].every(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d))) || options.startDate > options.endDate) throw new Error("Invalid SEC search dates");
  const offset = options.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0 || offset > 9900) throw new Error("Invalid SEC search offset");
  const forms = options.forms ?? [...SUPPORTED_FORMS];
  if (!forms.length || forms.some(f => !(SUPPORTED_FORMS as readonly string[]).includes(f))) throw new Error("Unsupported SEC search form");
  const params = new URLSearchParams({ q: options.query, ciks: options.ciks.map(normalizeCik).join(","), forms: forms.join(","), dateRange: "custom", startdt: options.startDate, enddt: options.endDate, from: String(offset), size: "100" });
  return `https://efts.sec.gov/LATEST/search-index?${params}`;
}
export type SearchResponse = { timed_out?: boolean; _shards?: { failed?: number }; hits?: { total?: { value: number; relation: string }; hits?: { _id: string; _source: { ciks: string[]; adsh: string; form: string; file_date: string; period_ending?: string; display_names?: string[]; items?: string[] } }[] } };
export function parseFilingSearch(data: SearchResponse, retrieval: Retrieval) {
  if (data.timed_out || data._shards?.failed) throw new Error("SEC full-text search returned incomplete results");
  if (!data.hits || !Array.isArray(data.hits.hits)) throw new Error("Invalid SEC full-text search response");
  const hits = data.hits.hits.flatMap(hit => {
    const source = hit._source;
    const document = hit._id.split(":")[1];
    if (!document || !source.ciks?.[0]) return [];
    return parseFilings({ form: [source.form], accessionNumber: [source.adsh], filingDate: [source.file_date], reportDate: [source.period_ending ?? ""], primaryDocument: [document], items: [(source.items ?? []).join(",")] }, source.ciks[0], retrieval)
      .map(filing => ({ filing, cik: normalizeCik(source.ciks[0]), name: source.display_names?.[0] ?? "", evidenceStatus: "document-match-not-verified-quote" as const }));
  });
  return { hits, total: data.hits.total?.value ?? hits.length, totalRelation: data.hits.total?.relation ?? "eq", provenance: { kind: "retrieved" as const, provider: "sec-edgar" as const, endpoint: retrieval.endpoint, retrievedAt: retrieval.retrievedAt } };
}
