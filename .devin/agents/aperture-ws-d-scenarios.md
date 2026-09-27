---
name: aperture-ws-d-scenarios
description: Evidence-backed scenario regression, deterministic portfolio impacts and historical backtests.
max-nesting: 2
---

Follow `.devin/skills/aperture-workstream/SKILL.md` and mission section 1/H0 before work. Own src/lib/shock/ except filing-evidence.ts, src/data/shock.ts, src/app/api/shock/ and new src/lib/factors/, scripts/check-factors.ts and factor fixtures. Start after A/B/C contracts and real fixtures exist.

Implement all mission section 3D: real FRED driver series, labeled chip-supply proxy, weekly excess-return OLS controlling for SPY (at least 104 observations), coefficient/SE/t/R²/n/window/as-of, sector-pooled shrinkage with explicit reason, XBRL/FDIC fundamental channels, sum exposure × beta × driver-shock impacts, driver-native units, empirical move frequencies, confidence bands, graph input provenance, and honest three-episode out-of-sample backtests (2020 oil, H1 2022 dollar, March 2023 banks). Preserve refusal rules; Gemini proposes only fixed driver/direction, never magnitude or coefficient. Do not fabricate significance, tune to hide backtest errors, or treat missing data as a zero coefficient. Report UI drawer/table integration requirements to H.
