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
| A | general + A profile | ws/a | ../lookthru-wt/a | blocked | 8a11027: quote/Alpha fallback pass; Stooq full checks fail | Review corrected GET/prefix; resolve Stooq timeout |
| B | general + B profile | ws/b | ../lookthru-wt/b | review | 072dfc3: SEC/quotes fixture+live and standard gates pass | Reviewers 1c61ace8 / 4656f3cf |
| C | general + C profile | ws/c | ../lookthru-wt/c | blocked | 7ad3f55: 18fund fixture/live pass; release sector residual assertion fails | Reviewers aff0f7c5 / c1cc9d16; sourced-sector integration |
| D | aperture-ws-d-scenarios | not created | not created | todo | not run | Factor model after real A/B/C fixtures |
| E | general + E profile | ws/e | ../lookthru-wt/e | blocked | 3727f68: Finnhub/SEC/webhook pass; missing GDELT fixture, live429 | Retry after backoff; no merge with failed full checks |
| F | general + F profile | ws/f | ../lookthru-wt/f | review | a640391: property/standard checks pass; live fixture lock-blocked | Reviewers 2887bfef / 8a262039; retry live with bounded wait |
| G | general + G profile | ws/g | ../lookthru-wt/g | review | b1e4116: offline gates pass; parent live PASS07:32:18Z | Commit parent bounded-wait test tweak, resolve reviews, merge first |
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
- Main TS87308f81: fixed canonical provenance equality with regression and made test:release discover/run ALL check-*.ts via isolated bounded runner. Code66f47202 approves. Securitye55c8cd6 spot-checked root guards with no new blockers. Full24checks/typecheck/lint/build pass. Runtime provenance coverage still pending.
- G securitye55c8cd6 passes; its request to copy main Ask/IC guards onto G rejected as unnecessary: G did not change those routes, normal merge retains main guards. G TS0065298c calls two Finnhub reservations critical; rejected as pre-existing conservative reservation for the two possible upstream attempts (baseline cache comment and finnhub retry loop prove it). Removing one would under-reserve retries. Restore explanatory comment lost in rewrite before merge; no quota weakening.

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
- Provider budget: five Alpha probes accounted (A two POST failures, main XOM/SPY GET successes, A one AAPL GET success07:42:01Z). A's second commit8a11027 corrected GET auth/no logging and restored finnhub shared-reservation key prefix. No further calls without budget allocation.
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

Commit reviewed main fixes after full24-check release/typecheck/lint/build PASS. Finish G review dispositions, commit parent live-check wait tweak on ws/g and merge G; run full integrated gates. Six background reviewers currently cover B/C/F (IDs table). Start D on committed real FRED/XOM/SPY fixtures as slots free, then H after first data merges. A Stooq, E GDELT and C sector integration remain explicitly blocked; do not weaken tests to merge them.
