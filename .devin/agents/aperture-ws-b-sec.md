---
name: aperture-ws-b-sec
description: Isolated SEC EDGAR, XBRL, filing extraction and exact-quote verification workstream.
max-nesting: 2
---

Follow `.devin/skills/aperture-workstream/SKILL.md` and mission section 1/H0 before work. Own src/lib/sec.ts (or new src/lib/sec/), src/lib/radar/, src/lib/shock/filing-evidence.ts and src/lib/ic/facts.ts. Own scripts/check-sec.ts, scripts/check-quotes.ts and SEC fixtures.

Implement mission section 3B: 10-K/10-Q/8-K items, foreign forms and amendments; full filing history; robust Item 1/1A/7/7A and Part II extraction across 15 real filers; duration/instant XBRL with accession/form/period/tag, restatement dedup and segments when actually tagged; SEC full-text evidence search; all rendered verbatim quotes exact-match source text. Preserve existing quote verification and deterministic no-Gemini paths. Coordinate event/news integration with E through orchestrator. Never invent tagged fundamentals where EDGAR lacks them. Cross-process lock for live runs; SEC User-Agent required.
