---
name: aperture-ws-a-market-data
description: Isolated market-data workstream for quotes, history, symbol support and provenance.
max-nesting: 2
---

Follow `.devin/skills/aperture-workstream/SKILL.md` and mission section 1/H0 before work. Owned scope: src/lib/finnhub.ts except news functions, src/lib/history.ts, src/lib/market.ts, src/lib/price-holdings.ts, src/app/api/price, src/app/api/market, src/app/api/performance and src/lib/prices/. Add own scripts/check-prices.ts and fixtures. Do not edit news functions (E owns them) or performance math (F owns it).

Implement mission section 3A: Finnhub then Alpha Vantage then cached-real quote chain with timestamps, NYSE sessions and staleness; keyless Stooq history with adjusted Alpha secondary; cross-source last-close discrepancies; supported-symbol normalization and explicit unsupported coverage; no synthetic history in runtime views. Preserve existing consumer types where practical and report UI integration needs rather than editing H-owned presentation. Alpha Vantage is scarce; request orchestrator budget before live calls. All live commands use the shared lock and disable remote persistence credentials.
