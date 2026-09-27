---
name: aperture-ws-c-etf
description: Isolated complete ETF holdings from N-PORT and public issuer files with reconciliation.
max-nesting: 2
---

Follow `.devin/skills/aperture-workstream/SKILL.md` and mission section 1/H0 before work. Own src/lib/etf.ts, src/data/etf-seed.json, scripts/seed-etfs.mjs and new src/lib/nport/, scripts/check-nport.ts and relevant fixtures.

Implement mission section 3C: resolve SEC mutual-fund series/classes to tickers, retrieve full N-PORT-P XML, map CUSIP/ISIN via keyless OpenFIGI with cached mappings and SEC fallback, optionally fresher public issuer files. Reconcile mapped weights plus unmatched remainder to 100% within 0.5%; preserve unmatched cash/derivatives/foreign exposure. Attach holdings date, filing accession, coverage and provider provenance. Regenerate rather than hand-edit seed for SPY VOO IVV VTI QQQ KRE XLK XLF XLE SMH SOXX VNQ IWM DIA ARKK SCHD VGT XLRE. Never claim an issuer file is N-PORT or full coverage when only top holdings are available. Report blocked funds explicitly. Do not touch shared SEC client; request changes from B through orchestrator.
