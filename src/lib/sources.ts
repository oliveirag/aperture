// Pure: how a source may be described to the reader.

// A filing passage linked to the filing document itself is copied verbatim. Figures computed from XBRL link to the
// filing's index page instead, and anything else is a summary or data.
export const isVerbatim = (q: { docType: string; url?: string; section?: string }) =>
  /^10-[KQ]$/.test(q.docType) && !!q.url?.includes("/Archives/edgar/data/") && !q.url.endsWith("-index.htm") && !q.section?.includes("XBRL");
