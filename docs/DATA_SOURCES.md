# Data sources and evidence

Aperture is an educational research tool, not investment advice. Provider observations, deterministic calculations, and user/modeling assumptions are separate kinds of evidence. A formatted number is not evidence that a provider returned it.

## Evidence contract

`src/lib/provenance.ts` defines:

- **Retrieved:** named provider, original retrieval timestamp, source endpoint, and the observation/filing period when supplied. Reviewed user input instead names the reviewed source; it does not invent a public URL.
- **Computed:** a readable formula and the evidence for its inputs. Unit conversion, aggregation, returns and regressions are calculations, not new retrieved observations.
- **Assumption:** a named source and rationale. Assumptions are not provider estimates.
- **Stale:** a cached-real fallback retains its original retrieval/as-of dates. Cache storage time and serve time are separate and must not replace provider retrieval time.

Numeric evidence maps use RFC 6901 JSON pointers. `src/lib/api-provenance.ts` audits exact numeric leaves, including nested maps, and rejects missing/orphan evidence, error responses counted as success, nonfinite values and numeric data hidden in source metadata. This audit infrastructure does not by itself establish that every route or rendered figure is wired correctly; the overnight acceptance checklist tracks that separately.

## Provider inventory

Endpoints below deliberately omit credentials. Some adapters remain on workstream branches; availability is not a blanket claim that all product integrations are complete.

| Provider | Endpoints / data | Limits and freshness | Configuration | Rights / limitations |
|---|---|---|---|---|
| SEC EDGAR | `https://www.sec.gov/files/company_tickers.json`; `https://data.sec.gov/submissions/CIK##########.json`; historical submissions pages; `https://www.sec.gov/Archives/edgar/data/...` | SEC maximum 10 requests/s; client serializes with at least 120ms gap. Recent/full filing lists: 6h; downloaded documents: 7d. | `SEC_USER_AGENT` must identify the application and a contact address. No key. | Public filing access requires fair-access compliance. Keep actual accession, document URL, form and period. An index/search page is not a quoted document. |
| SEC XBRL | `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json`; `/api/xbrl/frames/{taxonomy}/{tag}/{unit}/{period}.json` | Company facts: 1d. Same SEC shared limit. | Same SEC user agent; no key. | Distinguish instant/duration, currency/unit, restatement, and fiscal/calendar periods. Frames do not supply form: do not invent it. Companyfacts omits dimensional facts; use actual filing contexts for tagged segments. |
| SEC N-PORT | `https://www.sec.gov/files/company_tickers_mf.json`; filing `primary_doc.xml` | Holdings date is the filing period, not retrieval date. Current generated snapshots are pinned, not an automatic new-filing refresh service. | SEC user agent; no key. | Full source rows do not imply all identifiers are mapped. Preserve signed unmatched assets/liabilities and reconciliation warnings. Unit investment trusts may require another filing source. |
| Finnhub | `https://finnhub.io/api/v1/quote`, `/stock/profile2`, `/stock/metric`, `/company-news`, `/calendar/earnings`, `/stock/recommendation` | Free-tier ceiling 60 requests/min; local bucket 50/min. Shared limiter reserves possible retry attempts. Quote freshness 60s; profile/metrics 1d; legacy company-news cache 1h. | `FINNHUB_API_KEY`, sent in a header. | Account/exchange terms apply; access is not an unrestricted redistribution grant. Trade time differs from retrieval time. Unsupported symbols and provider failures stay explicit. Candles are not available on the supplied free key. |
| Alpha Vantage | `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=...`; `function=TIME_SERIES_WEEKLY_ADJUSTED` | Free-tier ceiling 25/day, shared across applications. Historical responses cached 1d. Scarce fallback, not a per-constituent default. | Existing `ALPHA_VANTAGE_API_KEY`; `APERTURE_ALPHA_DAILY_BUDGET=0` disables new calls in the new adapter unless explicitly budgeted. | HTTPS GET query authentication is required by the verified endpoint. Never log, expose or record that private URL; persisted endpoints omit the key. Provider/market-data terms apply. POST probes returned 405, not price data. |
| Stooq | `https://stooq.com/q/d/l/?s={ticker}.us&i=d` | Intended keyless daily-history primary, 1d cache in the new adapter. | No key. | Availability and split/dividend semantics must be verified, not inferred from CSV shape. Current verification encountered connection timeouts; no successful Stooq capture has been claimed. Do not bypass challenges or substitute an invented CSV. |
| FRED | `https://fred.stlouisfed.org/graph/fredgraph.csv?id={SERIES}` | Daily refresh target. Series have different frequencies and release lags. | Keyless CSV; `FRED_API_KEY` is optional, not required by this route. | FRED is a distributor, not a blanket license. Check each original series' notes/rights, including copyrighted third-party series. Do not call monthly/quarterly repeated values independent weekly observations. |
| FDIC BankFind | `https://banks.data.fdic.gov` call-report data | Adapter-specific query/cache policy must be verified before claiming live coverage. | Keyless. | Preserve reporting period, institution identifier and field definition. A bank subsidiary is not automatically its listed holding company. Integration/live verification pending. |
| OpenFIGI | `https://api.openfigi.com/v3/mapping` | Keyless request/batch limits must be respected; mappings cached/recorded rather than queried per render. | Keyless; `OPENFIGI_API_KEY` optional. | Preserve identifier and mapping method. Ambiguous share classes, obsolete identifiers and corporate actions are not resolved by fuzzy guessing. Mapping availability is not a market-price feed. |
| Issuer files | Public fund-specific holdings files, including SSGA SPY/DIA XLSX | File's own holdings date; daily publication is not a guarantee the latest session is present. | No new key for recorded public files. | SSGA terms restrict copying/dissemination beyond personal/internal uses. Raw workbook redistribution is unresolved and must be cleared or replaced before public publication. A Sector column containing `-` is unknown, not a classification. |
| GDELT DOC 2.0 | `https://api.gdeltproject.org/api/v2/doc/doc` | Bounded request count/body and timeouts; back off on 429. | Keyless. | `seendate` is observation time, not article publication time. Link to original publishers; do not claim ownership of their text. Successful macro fixture/live verification is currently blocked. |
| EIA / USITC | Agency pages cited by the scenario reference adapters | Mechanism references retain their publication/source dates; they are not equity-return coefficients. | No key for cited public references. | Attribute the original publication and check its notes. A mechanism citation does not establish a measured beta or future price move. |
| User import / OCR | Reviewed typed rows, CSV/workbooks and screenshot text recognition | Preserve source-row identity, actual review time, currency, confidence and quantity/value distinctions. | No new market-data key for parsing. | Never store account identifiers or private images in public fixtures. Unknown currency is not USD conversion; unknown quantity is not one fabricated share. |
| Gemini | Optional narrative service | May be quota/billing unavailable. Every numerical path must work without it. | `GEMINI_API_KEY` / `GEMINI_API_KEYS`, existing optional configuration. | Not a source of numbers, filing quotes or publication dates. Generated claims require source verification. No unreviewed private screenshots or keys in logs/artifacts. |

SSGA terms reviewed: https://www.ssga.com/us/en/footer/terms-and-conditions . Public availability of a workbook does not settle redistribution permission. This is a publication check, not a reason to fabricate substitute holdings.

## Recorded scenario-series distinctions

- `DCOILWTICO`: WTI spot series; percent changes around zero/negative prices require an explicit valid transformation or exclusion, not an undefined division.
- `DTWEXBGS`: broad dollar index.
- `DGS10`: yield quoted in percent; a 100bp shock is a one-percentage-point change, not a 100% return.
- `BAMLC0A0CM`: credit spread; retain its units, available history and original source licensing notes.
- `IR`: import-price index, monthly. Do not manufacture weekly observations.
- `DTB3`: annualized Treasury bill rate; conversion to a weekly excess-return input must show its convention.
- `BOGZ1FL075035503Q`: quarterly CRE index-level series; quarterly observations are not independent weekly observations.
- `COMREPUSQ159N` is a different series: year-over-year percent change, not a price level. It must not be substituted as if the units matched.

## Cache and local verification

Default local shared cache: `~/.cache/aperture-shared`, overridable with `APERTURE_CACHE_DIR`. Versioned records preserve Maps, Sets, dates and original metadata; unverifiable legacy records are not called fresh. Redis retention is distinct from freshness. Last-known-good data is labeled stale; unknown data is not zero.

For local integration/browser verification, explicitly blank remote Supabase and Redis credentials and set `APERTURE_LOCAL_VERIFICATION=1`. Set `NEXT_PUBLIC_APERTURE_LOCAL_VERIFICATION=1` **before building** a browser verification bundle. These flags disable remote storage; they never manufacture a signed-in user. Production authentication/RLS/quota controls are unchanged.

`npm run test:release` runs all `scripts/check-*.ts` in isolated child processes with provider/storage credentials blank. Individual checks control their own mock isolation mode so production fail-closed tests are not accidentally masked. This command proves offline contracts; it is not live-provider evidence.

`npm run warm` is a no-network plan. Actual warming requires `--live`, isolated storage configuration and the shared live lock. PASS/FAIL/SKIP are separate: skipped/unintegrated adapters do not satisfy live coverage. No remote Supabase migrations or writes are authorized by local warming.

## Fixture integrity and publication

`scripts/lib/fixtures.ts` stores a source endpoint, original retrieval timestamp, raw response body and SHA-256 digest. Captures are write-once. Binary issuer captures explicitly identify base64 representation. Configured credential values are rejected; this is defense in depth, not a complete secret/license audit.

Live checks/captures share a cross-process exclusive lock. A crash-left lock is reported with owner information; it is not stolen based solely on age. Fixture development must not consume provider quota repeatedly, and synthetic test inputs must never be represented as captured provider responses.
