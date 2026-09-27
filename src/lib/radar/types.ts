import type { RadarChange, Severity } from "@/data/radar";

// A real filing comparison for one company, as /api/radar returns it. "Why this matters to you" is not here:
// the client computes it from the X-Ray so it always matches the active portfolio.
export interface RadarFiling {
  ticker: string;
  company: string;
  filingType: "10-K" | "10-Q";
  filedAt: string;
  priorFiledAt: string;
  url: string;
  priorUrl: string;
  section: string;
  // null when the comparison found no material risk change.
  severity: Severity | null;
  category: string;
  title: string;
  summary: string;
  changes: RadarChange[];
  // Items Gemini proposed whose quotes weren't found verbatim in the filings.
  dropped: number;
  model: string;
  // "model": Gemini proposed the changes; "text": a sentence-level comparison found them. Both are quote-verified.
  method?: "model" | "text";
  checkedAt: string;
}

// NDJSON lines streamed by POST /api/radar.
export type RadarEvent =
  | { type: "progress"; ticker: string; message: string }
  | { type: "result"; ticker: string; filing: RadarFiling }
  | { type: "unsupported"; ticker: string; reason: string }
  | { type: "error"; ticker: string; error: string };
