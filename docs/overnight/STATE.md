# Overnight state — iteration 3, Wave 0 integration

## Phase: 1-data-wave

Mission: `/Users/zakariakhan/aperture-overnight-mission.md`, fully re-read this iteration.
Branch: `overnight/real-data`, based on `origin/main` at `06d5e3c`.
Do not restart completed setup. Next.js installed guide access and the approved local audit lint exclusion are RESOLVED.
No host loop-review findings supplied; independent foundation reviews handled below.

## Workstreams

| id | profile | branch | worktree | status | last gate result | next step |
|---|---|---|---|---|---|---|
| 0 | integrator | overnight/real-data | main checkout | merged | Release, all 21 checks, typegen, tsc, zero-warning lint and webpack build pass after fixes | Commit base, create six worktrees and dispatch |
| A | general + A profile | ws/a | ../lookthru-wt/a | running | npm ci pass | agent 90e88182: prices/history |
| B | general + B profile | ws/b | ../lookthru-wt/b | running | npm ci pass | agent 29d46639: filings/XBRL |
| C | general + C profile | ws/c | ../lookthru-wt/c | running | npm ci pass | agent 61a402df: ETF holdings |
| D | aperture-ws-d-scenarios | not created | not created | todo | not run | Factor model after real A/B/C fixtures |
| E | general + E profile | ws/e | ../lookthru-wt/e | running | npm ci pass | agent 9e717766: news/webhooks |
| F | general + F profile | ws/f | ../lookthru-wt/f | running | npm ci pass | agent 9f410ec4: imports/math |
| G | general + G profile | ws/g | ../lookthru-wt/g | running | npm ci pass | agent 95b41ccc: cache/isolation |
| H | aperture-ws-h-ui-qa | not created | not created | todo | not run | Provenance UI, copy and Playwright matrix |
| I | aperture-adversarial-verifier | not created | not created | todo | not run | Independent 50-figure trace |

## Definition of Done checklist (section 4)

- [ ] 1. All final gates pass on completed product. Baseline evidence: baseline.md; Wave 0 evidence: PROGRESS.md. Product implementation not complete.
- [ ] 2. All real-provider live checks pass with timestamps. Only foundational Apple SEC capture performed.
- [ ] 3. Playwright all routes × levels × 5 portfolios × 3 viewports, screenshots. Not implemented/run.
- [ ] 4. check-provenance.ts across every numeric API response. Shared validator exists, API integration/check not complete.
- [ ] 5. check-quotes.ts verifies every rendered filing quotation. Pending B.
- [ ] 6. Independent 50-figure trace clean. Not run.
- [ ] 7. All features with Gemini disabled. Existing fallback checks pass; complete browser proof absent.
- [ ] 8. Forced Finnhub failure uses labeled real fallback. Not verified.
- [ ] 9. Measured Shock, Explain drawers and real backtests. Pending D/H.
- [ ] 10. No imported view leaks demo constants, automated proof. Pending F/H.
- [ ] 11. Provider/demo/verification docs and optional env configuration. Pending implementation.
- [ ] 12. Harness hygiene. New profiles/skill and README ready; pinned ECC reused rather than duplicate vendoring. Workstream cleanup/final review still pending.
- [ ] 13. DONE.md contains all completion evidence. Intentionally absent.
- [ ] 14. Push branches and open one PR to main. Not performed; never merge or push main.

## Review dispositions

- Iteration 1 setup review and iteration 2 lint-scope review recorded in PROGRESS.md. No application lint rules weakened. Protected local audit contents unchanged.
- Earlier reviewer assertion that Next.js cannot generate the AGENTS block is disproven by installed `node_modules/next/dist/server/lib/generate-agent-files.js:53-62`, now read successfully.
- Foundation initial reviews: code `33de05f6`, TS `8cbb6486`, security `5eca893d`. Fixed URL allowlist/fragment mismatch, optional filing field validation, strict clock bounds, provider-host binding on fixture save/load, cleanup failure aggregation, orphan numeric evidence, and missing capture preflight/cross-process tests.
- Re-reviews: TS `69850a0f`, security `d1ada811`. Fixed explicit lock-handle type, 8KiB metadata text bounds, friendly malformed-URL failure, lock-owner timeout diagnostics, and removed shell access from adversarial verifier.
- Reject automatic stale-lock stealing: age alone is unsafe and deleting another worker's lock violates ownership. Fail closed, report PID/acquisition time, request specific orphan recovery approval. Documented in harness README and BLOCKERS.md.
- Reject swallowing cleanup errors after a successful operation: lost lock integrity must fail the check. AggregateError preserves original operation error when present; regression covers this.
- Arbitrary save/load fixture paths are trusted developer tooling (needed for temporary test roots), not exposed to application input. Network capture validates a fixed provider path and safe filename.
- Generic provenance validation checks shape only; provider adapters must bind trusted hosts and prove values independently. Known-key fixture leak detection is not a complete generic secret scanner; review before commit.

## Shared contracts / harness

- `src/lib/provenance.ts`: discriminated retrieved/computed/assumption types, filing references, RFC6901 numeric evidence map, runtime validation, URL redaction. User-import uses a named reviewed source rather than fabricated HTTPS URL.
- `scripts/lib/fixtures.ts`: write-once raw text fixtures with SHA-256 + source/time, fixed capture hosts, bounded fetch/response size, secret-key rejection, global live file lock. Capture takes its own lock (do not nest); complete live checks call withLiveLock separately.
- `scripts/fixtures/sec-edgar/aapl-submissions-2026-09-27.json`: real capture at 2026-09-27T07:01:58.677Z, name Apple Inc., latest form 4 filed 2026-09-24; digest dabb28a7c4af8fac408a72345ec959c1a08255a6c5c1af99c4f22b2beacfc77f. Golden helper test loads/verifies this capture.
- `416b1ef` is RED checkpoint: missing provenance/fixture modules. Review regression additions also reproduced failing before fixes. GREEN checks: check-provenance-contract.ts and check-fixture-tools.ts.
- `.devin/agents/`: nine mission profiles. `.devin/skills/aperture-workstream/SKILL.md`: shared safety/ownership/test contract. `.devin/README.md`: operational use.
- `devin doctor --json`: healthy, 77 profiles. Existing pinned ECC v2.2.1 supplies standard skills/reviewers. No duplicate ECC installation or hooks. max-nesting 2 allows one reviewer child using Devin's absolute-depth semantics; orchestrator may run reviews to enforce six-worker cap.
- Existing APERTURE_CACHE_DIR support works; live workers set `/Users/zakariakhan/.cache/aperture-shared`. G owns changing default and atomic/typed cache persistence. Fixture tests never use the shared real cache.

## Open risks / blockers

See BLOCKERS.md. No current permission blocker.

- Remote Supabase/Redis must stay disabled in ALL local live/test/server processes. Explicit blank environment variables override `.env.local`; never print/copy secret values.
- Provider budget: A used two Alpha probes (one stored POST-not-allowed response); integrator used two successful GET history calls (XOM/SPY) after confirmed Stooq connection timeouts. At least four probes accounted. No more Alpha calls without explicit remaining-budget allocation.
- Main recorded seven FRED series (WTI, broad USD, DGS10, investment-grade spread, import-price IR, DTB3, CRE BOGZ1FL075035503Q) and real XOM/SPY weekly-adjusted Alpha fixtures with 1403 observations each. These are for D; preserve source units (IR monthly, CRE quarterly—not weekly independent observations).
- Stooq SPY/XOM captures failed; diagnostic GET reports UND_ERR_CONNECT_TIMEOUT. This is an open live-history blocker, not a passing check. AAPL Alpha worker fixture currently contains a POST-not-allowed error; never treat as history. Cannot message running agents via resume (tool rejected); forward GET/budget correction when A reports.
- File ownership adjustments: E creates new news adapter instead of editing A's finnhub.ts; G owns imports/provider.ts, F all other import logic; route validation edits coordinate through integrator.
- Copy inventory read through line 370; remaining strings belong to H's full audit. Product docs/check scripts and both prior audit screenshots already read.
- Six worktrees created from 4d21d34, each npm ci passed (811 packages, zero vulnerabilities). No dev servers launched.
- Custom profile spawning failed although doctor discovers them; all six launched successfully with subagent_general plus explicit profile/skill files. Do not restart session/duplicate agents. No nested reviewers allowed while six workers active; integrator reviews as slots free.
- Worktrees deliberately have no .env.local symlink. Live commands use absolute --env-file to main repo and explicit blank remote store/Gemini vars. This prevents accidental Next startup loading remote write credentials.
- Integrator found IC run route still returned 503 without Gemini despite rules fallback implementation. RED59c1cce; removed gate and rejected nonobject bodies. Check GREEN.
- Ask regression RED30251a1: null request crash, malformed context crashes and unmodeled objects rendered as [object Object]. Fixed request/context validation and ticker+weight text; checks GREEN. New API provenance audit contract also GREEN (exact leaf evidence, nested maps, SourcedValue/envelope support, rejects error responses/hidden metadata numbers). All integrator code awaits independent review when a worker slot frees.

## Next action

Six agents are running. Continue independent API provenance/no-Gemini verification in main checkout, review IC route fix when a slot frees, then integrate workstream reports only after TS/security reviews and full gates per merge. Do not modify worker-owned files. Begin D when real A/B/C fixture contracts are available; H follows first merges. Do not stop for routine questions.
