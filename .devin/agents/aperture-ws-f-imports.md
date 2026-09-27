---
name: aperture-ws-f-imports
description: Portfolio imports, X-Ray reconciliation, shared valuation and sector invariants.
max-nesting: 2
---

Follow `.devin/skills/aperture-workstream/SKILL.md` and mission section 1/H0 before work. Own src/lib/xray/, src/lib/imports/ except provider.ts (G owns shared provider store), src/features/import/ logic only, src/lib/sectors.ts, src/lib/outlook.ts and src/lib/performance.ts. Own import/math checks and import fixtures. Do not edit CSS or presentation H owns.

Implement mission section 3F: broker CSV layouts for Fidelity/Schwab/Vanguard/Robinhood/IBKR, ticker validation, quantity/value/currency/cash/totals handling, OCR confidence row state and required user review. Consistent source-backed sector mapping. Property/invariant coverage for conserved portfolio value, sector residual, weights, symmetric overlap, unchanged quantities during repricing and one shared valuation across header/X-Ray/Shock/IC. Demo must use same real-data calculation pipeline with Sample portfolio label. Keep unsupported rows visible with their values, never silently discard denominator exposure. Use existing exported provider APIs until A/C merge, and report contract changes needed. Use only local PGlite database tests.
