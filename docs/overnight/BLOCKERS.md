# Overnight blockers and boundaries

STATE.md is authoritative for branch/agent status. No DONE.md or full-product completion claim is warranted yet.

## Resolved setup blockers

- Installed Next.js guide access works. The route/fetch/cache docs and `generate-agent-files.js` were read; the generated AGENTS block is genuine. Do not restart this investigation.
- The user approved excluding only protected local `docs/audit-2026-09-27/**` from ESLint. Application rules remain unchanged. Full lint passes.
- Git's initial exclusion assumption was stale: the three protected local paths were not excluded. They were added only to `.git/info/exclude`; contents remain untouched/uncommitted.

## Open: Stooq availability and market-data acceptance

- Node requests failed with `UND_ERR_CONNECT_TIMEOUT`; webfetch also failed.
- A's bounded IPv4 curl probes to both resolved addresses and ordinary Node IPv4/TLS probe could not establish TCP/TLS. No HTTP body or authentic Stooq CSV was obtained. See `ws/a` `scripts/fixtures/README-prices.md` for diagnostics.
- No verified official replacement hostname was established; no proxy, CAPTCHA or access-control bypass is authorized.
- Actual Alpha GET fallback is verified with original source timestamps: AAPL/XOM/SPY histories and AAPL GLOBAL_QUOTE. This does not establish Stooq correctness. Full Stooq-specific fixture/live gates remain failed, not skipped.
- Known project Alpha calls: initial two unsuccessful POST probes, three adjusted-history GETs for XOM/SPY/AAPL, one GLOBAL_QUOTE GET, and D's six history GETs = twelve accounted. External/team use may also consume the provider's 25/day. No further allocation without checking the budget.

## Open: GDELT availability and news acceptance

- Initial DOC2 requests returned HTTP429. Parent retry after substantial backoff failed transport. No successful macro fixture is present.
- E's full check exits1; `--available-fixtures` is explicitly only a partial check, not workstream acceptance.
- SEC/Finnhub news and durable webhook implementation have separate passing tests. Do not invent a DOC2 response or silently replace a publisher's publication date with GDELT observation time.

## Publication quarantine: original ws/c history

- Original commit `7ad3f55` contains raw SSGA SPY/DIA workbooks and an issuer-derived seed. SSGA terms permit limited personal/internal copying and restrict public dissemination: https://www.ssga.com/us/en/footer/terms-and-conditions . Do not push that branch/history without resolved rights.
- C follow-up `f7557f7` replaces default SPY/DIA inputs with genuine SEC N-30D schedules and derives partial sectors from SEC SIC evidence. It does not erase the earlier private history.
- Parent created `ws/c-public` from main `5d0ce3f` and selectively restored current code, SEC/OpenFIGI fixtures and SEC-only generated seed, excluding the entire issuer-file fixture directory. No history rewrite or deletion performed; original ws/c is preserved privately and is abandoned as a publication branch.
- Verify no private C commit is an ancestor and no issuer-file blob is tracked anywhere on the clean branch before publishing. SEC accessibility is not a blanket copyright claim; keep source attribution and provider rights notes.
- `ws/c-public` still needs graph/calculate residual integration: only subtract classified-and-modeled constituents from a partially classified sector total. Do not restore invented sectors or weaken tests.

## Open product integration and verification

- Value-only/cash/unsupported holding metadata must survive every store, API request and cache identity. F follow-ups and H integration are in progress; passing pure math is not proof the browser flow is complete.
- D's measured engine has real regression and episode diagnostics, but sector-constituent pools and B/FDIC explanation channels need integration. Monthly IR/quarterly CRE are not 104 independent weekly observations. Physical capex/chip-supply magnitudes must not be equated silently to equity-return proxies.
- Current-vintage episode diagnostics must remain labeled; they are not proof of vintage-correct predictive performance. Display the actual errors, including large misses.
- Numeric provenance validators enforce structure, not truth. Full API coverage, every displayed financial figure, final exact rendered quote checks, the 50-figure independent trace and full Playwright matrix are still required.
- H must rerun after data merges. No blanket browser/axe/link-check success has been claimed.

## Mandatory remote-service isolation

- No remote Supabase migrations or data writes, Redis mutations, deployments, billing changes, email delivery or webhook registration are authorized by this mission.
- All local live/server processes explicitly blank Supabase URL/anon/service-role and Upstash/KV URL/token variables. Gemini is disabled during non-model verification. `.env.local` is never printed, copied or modified.
- Main now supports `APERTURE_LOCAL_VERIFICATION=1`; browser verification also sets `NEXT_PUBLIC_APERTURE_LOCAL_VERIFICATION=1` before build. These only disable remote stores, never bypass auth/RLS or manufacture sessions.
- Offline release checks blank real credentials and clear inherited isolation flags so their own deliberate mock production tests can verify fail-closed behavior.
- Team-only later action: review/apply pending import/cache migrations and E's durable webhook migration through the normal approved deployment process. Nothing has been applied remotely. Missing durable store causes webhook503, not a success ACK.

## Harness and resource boundaries

- Existing ECC is pinned and reused, not installed twice. Nine project profiles/shared skill/README exist and doctor recognizes77profiles. This is a deliberate adaptation of the original literal-vendoring instruction, not a claim that `.claude/skills` was duplicated.
- New custom profiles were discovered but could not spawn in the current session; general agents execute their explicit profile files instead. AgentShield absent; scoped independent manual reviews are recorded in STATE/PROGRESS.
- At most six background agents; foreground reviews may run while workers progress. A running agent cannot be resumed to send a message, so queue integration notes for its completion rather than repeatedly trying.
- Live locks fail closed and provide owner information. Contention is handled with bounded waiting. Never steal a lock based only on age; removal of a confirmed orphan needs specific approval.
- The original deterministic scripts ignore `--live`; passing them with that argument is not live-provider evidence. New provider checks explicitly distinguish fixture/live modes and failures.
