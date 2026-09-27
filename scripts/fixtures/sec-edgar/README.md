# SEC workstream B: real-source verification

All JSON files in this directory and `../sec-xbrl/` are **unmodified real response bodies** in the shared fixture recorder's envelope. No provider shapes or filing text were manufactured. `loadFixture` validates each SHA-256 before tests use the body. Retrieval time is the envelope's `retrievedAt`; filing dates, reporting periods and XBRL filing dates remain separate fields in the body. The existing Apple submissions capture is retained unchanged.

## Reproduction

- Fixture checks: `node --import tsx scripts/check-sec.ts` and `node --import tsx scripts/check-quotes.ts`. Each creates an isolated temporary cache before importing provider modules and makes no network requests.
- Capture missing fixtures: `scripts/check-sec.ts --capture` uses `captureFixture`, which locks each request itself, requires `SEC_USER_AGENT` with contact email, throttles requests and never overwrites captures. Do not wrap this in another live lock.
- Live checks: `scripts/check-sec.ts --live` and `scripts/check-quotes.ts --live` each hold `withLiveLock` for the entire check. Use Node's `--env-file=/Users/zakariakhan/Documents/lookthru/.env.local`, explicit blank child variables for Supabase service-role/URL/anon, Upstash URL/token, KV URL/token, and Gemini API key/key list, and `APERTURE_CACHE_DIR=/Users/zakariakhan/.cache/aperture-shared`. No Alpha Vantage, remote database or deployment is used.
- `--inspect` prints actual filing headings for manual boundary review; `SEC_INSPECT` selects a symbol, and `SEC_INSPECT_FORM` selects an alternative captured document suffix.

## Coverage

`check-sec.ts` contains independently reviewed half-open text boundaries for 60 sections across 15 real annual filers: AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSM (20-F), BXP, ZION, WAL (regional-bank/KRE universe), XOM, JPM, BRK-B, HCKT (small cap), and RDDT (2024 IPO). Boundaries target the body, not the table of contents. The JPM/XOM Item 7/7A reference stubs stay explicitly labeled rather than being mistaken for complete MD&A. Other captures cover Apple long and short 10-Q Part II risk updates; real 8-K items 1.01 (BXP), 2.02, 5.02 and 8.01 (AAPL); Apple historic amendments; and TD's 40-F.

XBRL fixtures cover domestic, banking and foreign filers, unframed facts, annual-only foreign financials, duration/instant distinction, historical changed comparatives, accession/fiscal context deduplication, order-independent latest-restatement selection, Q4 derivation, non-additive EPS, missing debt components, and the SEC cross-company revenue frame. Bank net revenue is net interest income plus noninterest income from the same accession/period/unit, **not** an ASC 606 fee subtotal. Companyfacts contains no dimensional allocations; the Apple filing's actual inline-XBRL contexts provide reportable segment and geographic revenue. Both reconcile to reported FY2025 consolidated revenue of USD 416,161,000,000. Overlapping axes are retained, never automatically summed.

`check-quotes.ts` exercises 180 real risk passages, normalization recovery, invented-continuation refusal, same-source 'new' refusal, and the actual IC/ Shock excerpt builders. Returned quotes are exact source slices, not just normalized model text. Numeric Gemini-authored summaries/labels are refused. Source quote provenance retains the document retrieval timestamp; removed IC quotes link to the prior filing.

## RED/GREEN evidence

The initial fixture check failed because the shared pure `parseFilings` entry point did not exist. The quote check separately failed because `sourceQuote` did not exist. Subsequent real-fixture checks exposed the JPM/XOM reference stubs, normalized-but-not-source-exact output, SEC array-order sensitivity, a fixture-envelope spread into provenance, and Zions' fee-subtotal selection. Those checks now pass; no existing baseline assertions were removed. Additional real 8-K captures replaced assumptions about which items were in Apple's latest current report.

Required gates have passed in this worktree: `npx --no-install next typegen`, `npx --no-install tsc --noEmit`, `npm run lint`, `npm run test:release`, own SEC/quote fixture checks, existing Radar/IC checks, and both locked live modes. The release suite's logged simulated `sec 503` is its intentional last-known-good fallback test, not a live provider failure. No production build or browser-level UI audit was claimed.

## Live evidence recorded during implementation

- Captures: 2026-09-27T07:14:57Z–07:15:46Z; short quarterly capture 07:21:38Z; additional 8-K and 40-F captures 07:33:59Z–07:34:06Z. Exact timestamp/digest/endpoint is in every envelope.
- 2026-09-27T07:35:36Z: Apple history contained 368 supported filings, back to 1994-01-26. Latest quarterly revenue: USD 109,417,000,000 for 2026-03-29–2026-06-27, accession `0000320193-26-000020`, tag `us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax`; companyfacts retrieved at 07:35:35.725Z.
- 07:35:36Z: Apple annual accession `0000320193-25-000079` yielded 42 genuinely tagged dimensioned revenue facts (different periods/axes).
- 07:35:37Z: EFTS `Taiwan`, NVIDIA, 10-K, 2024-01-01–2026-09-27 returned three filings; all three fetched-document evidence excerpts passed exact-source verification.
- 07:35:38Z: revenue frame `CY2025Q1` contained 2,546 companies. Apple USD 95,359,000,000, period 2024-12-29–2025-03-29, accession `0000320193-26-000013`. Frame API omits form/filing date; the parser leaves form null rather than inventing it.
- 07:35:39Z: live Apple annual quote verification passed 12 passages against `aapl-20250927.htm`.
- Final locked recheck at 07:44:12Z–07:44:17Z passed the same history/segments/search/frame/quote assertions. Apple's cached-real companyfacts correctly retained its original 07:35:35.725Z retrieval time. EFTS was freshly retrieved at 07:44:15.666Z and the frame at 07:44:16.608Z; exact Apple quotes passed at 07:44:17.139Z.

## Integration boundaries / honest limits

- `listFilings()` and `Filing` retain the existing domestic default contract. Use new `listFilingHistory()` / `SecFiling` for expanded recent/full histories and `latestFilingPair()` for a chosen supported form. Legacy Radar/IC/ Shock filing UIs still require shared source/form widening before foreign-form narrative comparisons can be wired in.
- `extractItem()` exposes full, untruncated text and exact offsets/status. Legacy `extractSection()` still caps model context at 150,000 characters and labels fallback text as unlocated. 40-F has no standard domestic item layout and explicitly returns unsupported for domestic items. Historical rows lacking a primary document retain the index but refuse to masquerade as filing text.
- Foreign annual XBRL never becomes fictional quarterly values. TSM's captured companyfacts revenue ends in 2024 even though the retrieval is in 2026; its original reporting period remains visible.
- Frame observations are calendar-aligned cross-company data, not fiscal company history. No form is synthesized. Segment support deliberately excludes unsupported transforms/typed dimensions and keeps all intersecting axes.
- UI integration must expose the additive provenance/numericEvidence fields. `src/features/radar/live-model.ts` is outside B ownership: its removed-quote source link also needs to choose `priorUrl`/`priorFiledAt` (the owned IC path is fixed).
- IC no longer uses Gemini-generated grounded news claims. Workstream E should wire its deterministic news adapter into `newsFacts` during integration. The existing Finnhub path is preserved.
- `src/lib/ic/rules.ts` is outside B ownership and still labels a generic debt signal as “Total debt”. The integrator must render `Signal.measure` instead for reported long-term-debt measures. Native-currency XBRL facts remain visible but are excluded from the existing USD-only rules signals. The rules' existing claim that cash covers debt when debt is missing also needs an honest unavailable state.
- Cache fallback status propagation remains the shared cache workstream's responsibility; no shared cache, provenance or fixture-recorder implementation was edited.
- Independent TypeScript/security review is delegated to the integrator, as nested workers were prohibited.
