# Aperture workstream harness

ECC is supplied by the project plugin pinned in `config.json`. Do not stack a second ECC install or hooks over it. Invoke plugin skills as `/ecc:<name>` and use the `ecc:*` reviewer profiles. `continuous-agent-loop` is the canonical replacement for `autonomous-loops`.

Every Aperture profile follows `skills/aperture-workstream/SKILL.md`, the assigned mission workstream and the orchestrator's ownership boundaries.

| Profile | Responsibility |
|---|---|
| aperture-ws-a-market-data | Quotes, market sessions, symbols and price history |
| aperture-ws-b-sec | Filings, XBRL, section extraction and exact quotes |
| aperture-ws-c-etf | N-PORT/issuer holdings and weight reconciliation |
| aperture-ws-d-scenarios | Measured factor models, impacts and backtests |
| aperture-ws-e-news | News/event normalization and webhook idempotency |
| aperture-ws-f-imports | Import review, portfolio math and valuation invariants |
| aperture-ws-g-cache | Cache correctness, local storage and API hardening |
| aperture-ws-h-ui-qa | Provenance UI, accessibility and browser matrix |
| aperture-adversarial-verifier | Read-only independent source tracing |

Workstreams use separate `ws/*` branches/worktrees; only the integrator merges them into `overnight/real-data`. Maximum six background workers, including nested reviewers. `max-nesting: 2` allows one worker-to-reviewer level under Devin's absolute-depth convention. If nesting tools are unavailable, return the diff for integrator-run reviews. The verifier has no shell or write tools; the integrator runs command-based checks and supplies artifacts for independent inspection.

Use `devin doctor --json` to validate discovery. Next.js version-specific docs are in `node_modules/next/dist/docs/`. Resume from `docs/overnight/STATE.md`; update it after gates/merges. Never equate fixture tests or schema validation with verified live source accuracy.

The shared fixture helper writes immutable raw-body captures with source/timestamp/digest, restricts network destinations and serializes live captures. `withLiveLock` fails closed on crash-left locks; it never steals a lock based only on age. Escalate an orphan lock for explicit recovery rather than delete another process's file. The fixture secret check covers configured provider keys, not all conceivable credentials; review captures before committing. Never place keys in commands, logs or URLs shown to the user. Blank remote database/KV credentials in all local verification processes.
