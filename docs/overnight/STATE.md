# Overnight state — updated 2026-09-27T10:40:07Z, iteration 5

## Phase: 2-scenario-wave

Mission `/Users/zakariakhan/aperture-overnight-mission.md` re-read in full. Main branch `overnight/real-data`, originally based on origin/main `06d5e3c`. Setup/guide access/approved audit lint exclusion are resolved. No host loop-review report has arrived; independent reviews below drive fixes. Never write DONE while a requirement is uncertain/unmet.

## Workstreams

| id | branch | worktree under ../lookthru-wt/ | status | last result | next step |
|---|---|---|---|---|---|
| 0 | overnight/real-data | main | merged | shared provenance/fixture/lock infrastructure | do not restart setup |
| A | ws/a | a | blocked | 2a2633c; real Finnhub/Alpha quote/history pass; Stooq absent | retry only after backoff; full price check still fails |
| B | ws/b | b | merged | 5d0ce3f; 15filers/60sections/180quotes; parent live08:20:33–37Z | foreign narrative consumers / exact-source follow-ups |
| C private | ws/c | c | blocked | f7557f7; private7ad3f55 ancestor contains issuer workbooks | explicitly ABANDONED for publication, preserve privately, never merge/push |
| C public | ws/c-public | c-public | merged | cbb6380 merges1d2a4f3/f91332a; parent32checks/typegen/tsc/lint/build PASS | preserve real classification/source contract in D |
| D | ws/d | d | review | 896a614; own29checks/typegen/tsc/lint/build PASS; FRED live08:17:49Z | final trust/negation review, then careful F/C/H integration |
| E | ws/e | e | blocked | a0c0ef4; durable webhook/PGlite pass; GDELT absent | full news check fails; no acceptance around missing fixture |
| F | ws/f | f | merged | 89944c3 merges4ffbdde; parent35checks/tsc/lint/build PASS after adapter fixes | keep A full history when eventually integrating it |
| G | ws/g | g | merged | 376e3ea; cache/live/SQL/quotas verified | adopt API helpers everywhere; register remaining warm adapters |
| H | ws/h | h | review | 84a22e7; 29+9checks/build; 48route+30control+18motion offline cells | fix source-map/performance wiring and a11y findings, rerun after integrations |
| I | integrator + final fresh verifier | not created | todo | no final50figure trace | API-wide producer mapping/checker, then independent audit |

Current background workers: NONE. All previously launched agents have completed. Do not duplicate them based on old progress entries. Worktrees are clean except main's reviewed integration fixes awaiting checkpoint commit. H's port3008 was stopped by its worker; no main dev server launched.

## Definition of Done checklist

- [ ] 1. Final completed-product gates. CURRENT integrated35scripts/typegen/tsc/lint/webpack37pages pass; D/H/A/E not all integrated. Latest evidence PROGRESS.md iteration5.
- [ ] 2. Every actual live gate. SEC/quotes/NPORT/cache/import/FRED/Alpha partial evidence exists; Stooq, GDELT and FDIC remain blocked. Ignored --live arguments are not proof.
- [ ] 3. Full browser matrix. H reports96 successful OFFLINE/degraded/control/reduced-motion cases; 15 Advanced cells initially blocked by now-fixed F retry loop; live0/585 verified. Artifacts local under h/test-results.
- [ ] 4. API-wide check-provenance.ts. Shared auditor now covers numericProvenance, DataEnvelope, direct provenance maps and named metadata registries. Producer wiring and full check are still missing.
- [ ] 5. All rendered quotes. Current check-quotes passes180 fixture quotes and12 liveApplequotes; final integrated rendered corpus still needs audit.
- [ ] 6. Independent50figure trace. Not run.
- [ ] 7. No-Gemini every-feature browser proof. Ask/IC fallback checks pass; full matrix remains.
- [ ] 8. Forced Finnhub failure browser proof. A library fallback checks pass, not full views.
- [ ] 9. Measured Shock/Explain/Advanced backtests. D implementation and independent math checks exist; final UI/data integrations incomplete.
- [ ] 10. Imported views never use demo constants. F logic/H tests improved, complete integrated proof pending.
- [ ] 11. DATA_SOURCES.md/.env.example updated in1587b50. DEMO.md/VERIFICATION.md/final source status still need updating.
- [ ] 12. Harness review/branch dispositions/worktree/server cleanup/clean tree. Original private C history must remain unpublished. No remote mutations.
- [ ] 13. DONE.md with evidence. Intentionally absent. FINAL_REPORT.md also required at finish.
- [ ] 14. Push approved safe branches and one PR to main. Not done; never push main or merge PR.

## Review dispositions

- Generated Next AGENTS block verified against installed generate-agent-files.js. ECC plugin was intentionally installed by user and pinned. Repeated reviewer claims these are malicious instructions are rejected with that evidence; do not remove approved project instructions.
- G two Finnhub reservations intentionally prepay two possible upstream attempts. Removing one would undercount quota; code/security reviews agree. Public local-verification flag masking production503 regression fixed70f0ba0, tests control their own modes.
- C public TS7a57db15/securityf3455560/code90c26722 reviewed. Explicit missing-filing guard added1d2a4f3; parent independently ran31checks, seed reproduction, typecheck/lint/build. Transient font ECONNRESET retried successfully in that worktree; final main build was clean.
- C sector bug FIXED: subtract only classified-and-modeled intersection, not all scenario-labeled names. VOO MCD weight0.00297773611055; old subtraction0.06074825438133; correct intersection0. Unknown sectors remain explicit, not fabricated.
- F React history selection/races/currency/empty-state fixes in57e7ee5. Parent reproduced history503 causing199requests/250ms, fixed4ffbdde with settled cache, explicit retry, abort/version guard, stable valuation and original history points. Chromium test proves one request per retry and $111 historical endpoint unchanged. Code5f9e5f70 approves; memo churn is nonblocking.
- F TS7a8cd30c's Shock boundary finding belongs to D (being replaced); IC facts public content/signal contract mismatch is pre-existing, not a secret leak, and must be resolved in API integration. Durable import trust/auth reviewf153f787 passed; initial auth/sessionStorage owner-binding edge case remains a low-priority hardening item.
- F/C integration initially failed legacy Alpha source assertion, then4TS errors from raw provider profiles passed as domain inputs. FIXED via actual etfInput adapter, preserved EtfHolding classifications, stronger SEC issuer/URL/as-of assertions. All35integrated checks/tsc/lint/build pass; no assertions deleted.
- Main current integration code7a152dcc/security60939677 approve. TSf19fff23 warns about structural container ambiguity: explicit collision tests now prove reserved kind/data/pointer conventions fail closed; DataEnvelope is already declared in provenance.ts. numericProvenance is the unambiguous form for new APIs. Named registries do not supply numeric coverage. Traversal is bounded; no cycle bypass. Legacy internal scenario find assertions are superseded by pending D; do not misrepresent as an exposed input vulnerability.
- D eeb93276 and361cb858 independently reproduced OLS/HC3 to~1e-16, checked no future-data leakage and large episode errors. First parser magnitude/quarter dating/null-to-zero/classification/extrapolation findings fixed7eab021. Subsequent negation, untrusted client provenance, prototype driver lookup fixed896a614 after RED tests; final narrow independent review still needed.
- H first review attempts used parent-typo h84a22e7 path; invalid reviews disregarded. Corrected direct-file reviews b319c4e0/01f23307/94074eae/6e7d2e83 completed. Actual fixes needed: IC announcement/focus, pause for decorative motion/main landmark, client resolver for envelope/direct maps, actual performance evidence prop/delta provenance. Never borrow an ancestor's unrelated evidence merely to hide missing local evidence. New-tab/noopener nits can be included.
- H missing evidence must not be laundered as verified. Final UI should suppress unprovenanced financial figures or explicitly qualify supported assumptions; map every financial figure before claiming completion. No full live/browser/a11y success claimed.
- E current TS15ffbd8e/security5cd3f74c approve scoped durable code. Global advisory lock and shared provider budget are deliberate, not security bypasses. Full GDELT fixture gate still fails. New SEC cache-key invalidation needs integration review before enabling webhook.

## Source and operational evidence

- Main commits: 1587b50 IC debt/warmer/docs;6f2c145 pinned Playwright1.55.1 + esbuild0.28.2; cbb6380 C-public merge;89944c3 F merge. Final integration fixes in this checkpoint pending commit.
- Dependency publish dates verified: Playwright2025-09-23; esbuild2026-08-08. npm audit0vulnerabilities. Chromium regression uses repo-installed Playwright, not user npm-cache dependency.
- C-public seed reproduces18funds with NO issuer-file directory:16NPORT + SPY/DIA N-30D. Live08:38:15–22Z. SPY503positions/NAV648531405608/asOf2026-03-31; DIA30/NAV42843688951/asOf2026-04-30. Mapping and sector coverage remain partial/disclosed.
- No private7ad3f55 ancestor or issuer-file tracked history in C-public/main. Source includes SEC/OpenFIGI attribution; no blanket redistribution claim.
- D XOM oil: beta0.3162881676175693,HC3SE0.11341207628349015,t2.7888402891678004,R2.30169557567976923,n156,2023-09-29..2026-09-18. Full-model R2, not oil-only explanatory power.
- D episode errors: oil2020 +3.0197pp; AAPL/USD2022 +22.6516pp; KRE/yield2023 +23.0231pp. Current-vintage factor-only diagnostics, not production forecasts; retain errors and horizon qualifications.
- D quarter frequency corrected: DGS10 denominator257, credit11, CRE298, lastcompleted2026Q2. Native100bp=1pp proven with nonnull XLRE result. Extreme KRE+1000bp remains unclipped and carries OUT_OF_TRAINING_SUPPORT/LINEAR_LOSS_EXCEEDS_EXPOSURE.
- Current XOM CIK is0002115436, not predecessor0000034088. D captured real current SIC2911 at09:00:13.340Z; no Alpha call. Sector constituent pooling and most B/FDIC explanation channels remain incomplete.
- Alpha calls accounted: TWELVE total (2failedPOST, XOM/SPY/AAPL history3, D six histories, AAPL GLOBAL_QUOTE1). No further allocation yet; external/team consumption unknown.
- Stooq ordinary IPv4 curl+Node TCP/TLS could not connect; no body or verified alternatehost. GDELT429 then transportfail. FDIC failure lacked retained status. Retry after backoff, never invent fixtures.

## Safety / unresolved integration

- Explicitly blank Supabase URL/anon/service-role, Upstash/KV URL/token, Gemini variables in every command that may load .env.local. Live commands use absolute --env-file and APERTURE_LOCAL_VERIFICATION=1, shared cache/lock. Never print/copy keys or apply remote migrations.
- Worktrees intentionally have no .env.local symlink. Offline checks use isolated caches and blank provider credentials. No Alpha enabled in browser runs without explicit allocation.
- Generic provenance validates shape, not authority. D now downgrades client-claimed provider evidence. Apply corresponding trust handling to other public analysis endpoints without repricing frozen values.
- Main still has F's temporary history adapter; A full implementation must replace it when its blocked gate is resolved. Legacy Finnhub metadata and screenshot Gemini-number paths still need integration; do not enable unbudgeted Alpha routes in live verification.
- Shared pool/type/hook integration and H's full matrix need reruns after D/H/API work. Surface severity-dependent extrapolation warnings, data coverage and real historical diagnostics. No implicit physical-chip-to-equity conversion.
- No worktree removal yet; preserve H screenshot evidence before cleanup. All extra worktrees/server cleanup and clean-clone verification remain mandatory.

## Next action

Commit current reviewed F/C bridge + provenance-container tests and this checkpoint. Then update H worktree to current main and fix its concrete UI/contract/a11y findings. Start a separate API-provenance integration worktree for all producers/check-provenance.ts and cross-endpoint client trust. Re-review D896a614 and integrate carefully (measured graph replaces legacy residual graph; preserve source/exposure conservation regressions, not obsolete coefficients). Continue other eligible work while A/E provider gates remain blocked. No DONE/PR completion claim.
