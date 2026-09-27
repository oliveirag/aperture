# Recorded full-source ETF holdings

## Canonical versioned contract

`src/lib/nport/contract.ts` exports `ETF_SCHEMA_VERSION = 2`, `SourcedEtfProfile`,
`SectorClassification`, `SectorCoverage`, `EtfSeed`, `validateSourcedProfile` and
`validateSeed`. **Every sourced record** carries numeric `schemaVersion: 2`.
`validateSeed(raw)` returns `{ profiles, meta }`, not an unchecked cast of the
mixed profile/`_meta` object. All weights are finite **numbers**, fractions of
original net assets; there are no numeric strings or renormalized top lists.

`getEtfProfile` returns `SourcedEtfProfile | null` from the validated recorded
seed without provider requests. Unknown funds return null; `etfAvailability`
supplies the unavailable reason. `parseProfile` retains genuine legacy Alpha
responses for explicit callers, with unverified warnings. Any sourced markers
(version, provider, coverage, evidence, runtime fields or canonical holding
fields) invoke strict validation. Malformed purported-sourced records return
null and **cannot fall through to the legacy parser**. Invalid committed seeds
fail the runtime boundary loudly. Callers receive clones, never mutable seed
references.

The generated record still has `last_updated = asOf`, and each holding still
has `symbol = ticker` and `description = name` for the old graph until D migrates.
These are string aliases only; `weight` remains a number. D can import the
canonical types/factory directly without importing the CLI fixture ingester.

- `holdingsSource`: real retrieval timestamp, holdings date, original HTTPS URL,
  actual filing form/accession/CIK/filed date. No invented filing identity.
- `identity`: SEC series/class for N-PORT only. These investments and net assets
  describe the whole series, not assets attributable to one class.
- `coverage`: mapped/signed unmatched weights, original reported weight, source
  completeness, counts and independent reconciliation. Complete source is NOT
  complete ticker mapping or complete sector classification.
- `unmatched`: all unidentified, non-equity, foreign and short positions, plus
  signed net-other-assets/liabilities. No loss of portfolio value.
- `provenance`: RFC6901 pointers relative to the record excluding its `provenance`
  map and `holdingsSource` object. Every numeric field, including the structural
  version discriminator, is checked by `assertNumericProvenance`.
- `warnings`: incomplete classifications, periodic/as-of limitations, mapping
  limitations and stale cached evidence. Original retrieval dates are retained.

N-PORT weights are `pctVal / 100`; residual is independently
`(netAssets - sum(all valUSD)) / netAssets`, including negative liabilities.
A difference over 0.005 warns, as do material pctVal/value disagreements.

## Sourced sectors, not invented GICS

`sectors.ts` implements `sec-sic-crosswalk-v1`, matching the conservative exact
codes in workstream F's `src/lib/sectors.ts`. It does not modify that owned file.
SEC SIC is an issuer classification, NOT GICS. Broad codes such as 7370
(GOOGL/META), 7374 (RDDT), and 5961 (AMZN) remain unclassified. No classification
is read from SSGA's `Sector` header: NVDA/AAPL/MSFT cells were actually `-`.

Fifteen `sec-edgar/*-submissions.json` captures are exact read-only reuses of B's
captures: AMZN, BRK-B, BXP, GOOGL, HCKT, JPM, META, MSFT, NVDA, RDDT, TD, TSM,
WAL, XOM and ZION. `loadFixture` verifies their body hashes; `saveFixture`
preserves original body, endpoint, retrieval time and SHA-256. The pre-existing
AAPL capture is also used. One additional locked SEC capture supplies MCD's
SIC 5812 (eating places -> Consumer Discretionary). XOM's captured submissions
has an empty ticker list, so it does NOT authorize classifying a historical XOM
holding from its filename. Unsupported tickers/codes stay unknown.

Each classified holding carries its SIC, CIK, source and crosswalk method.
Sector weights are sums of those actual constituent weights; evidence includes
both holdings weight evidence and SEC submissions plus the explicitly labeled
crosswalk assumption. `sectorCoverage` reports classified weight and count,
total mapped holding count, and signed `unclassifiedWeight = accountedWeight -
classifiedWeight`. This remainder includes unmapped securities and net other
assets; it is not assigned to a made-up sector or treated as zero exposure.
Current issuer SIC is not represented as historical SIC at the holdings date.

VOO has genuine MCD Consumer Discretionary weight **0.00297773611055** from its
2026-06-30 N-PORT position. That non-named constituent supports a real oil-sector
residual. Tests verify this from the sourced holding, not old Alpha constants.

## SEC replacement for SPY/DIA; publication quarantine

SPY and DIA are absent from SEC's mutual-fund series/class ticker list. They have
public trust N-30D schedules; absence from that list is not absence of holdings.
The seed now uses **only SEC captures**, not SSGA workbooks, for both:

| Fund | CIK | Form / accession | Holdings date | Filed | Positions | Net assets USD |
| --- | --- | --- | --- | --- | --- | --- |
| SPY | 0000884394 | N-30D / 0001193125-26-247066 | 2026-03-31 | 2026-05-29 | 503 | 648531405608 |
| DIA | 0001041130 | N-30D / 0001193125-26-290785 | 2026-04-30 | 2026-06-30 | 30 | 42843688951 |

These are the latest N-30D reports found in captured current submissions, both
semiannual (not a claim to be annual/daily or N-PORT). Captured 2026-09-27 at
08:09:57.456Z (SPY) and 08:09:59.966Z (DIA). Exact primary-document URLs and hashes
are in `sec-edgar/{spy,dia}-trust-n30d.json`; accession metadata is independently
bound to `*-trust-submissions.json`.

`trust.ts` reads the actual HTML tables using pinned SheetJS. Every security row
must have positive integral disclosed shares/value. All constituent values must
sum exactly to the schedule's reported total AND the investment total on the
balance sheet, before adding any residual. Truncated/inconsistent schedules fail.
Weights are `security value / net assets`, not percentages inferred from names.
No fictitious series/class, CUSIP or GICS. Exact unique SEC company-name matching
is used where possible; ambiguous classes and changed names remain unmatched.
SPY mapped coverage is 67.9737%; DIA 73.3746%. The rest remains valued and visible.
Full schedules do not mean full ticker mapping. No workbook data contributes to
these profiles or their SEC-name mappings.

**Do not push this ws/c history.** Review on 2026-09-27 of
<https://www.ssga.com/us/en/footer/terms-and-conditions> confirmed permission for
personal/internal copies, but restrictions on copying/disseminating/transferring
site information publicly. Original commit **7ad3f55** still contains the raw
`issuer-file/spy-xlsx-base64.json` and `dia-xlsx-base64.json` restricted bytes,
and its old generated seed uses those workbooks. They have NOT been deleted,
history rewritten, or pushed. `--capture-issuer` is disabled. Default reproduction
and checks no longer read them; `--private-issuer` retains their old parser
regressions for this private worktree only.

Parent must preserve/abandon the private history and create a clean publication
branch omitting those raw workbooks and the old workbook-derived seed, selecting
the current SEC-only seed/code/fixtures instead. Public EDGAR retrieval is the
alternative factual source here, not a legal assertion that all text in every
issuer-submitted filing is copyright-free. Publication/rights review of captured
filing documents remains the integrator's responsibility; no permission is
inferred merely from a successful HTTP response.

## Reproduction / acquisition

```sh
node scripts/seed-etfs.mjs
node scripts/seed-etfs.mjs --check
node --import tsx scripts/check-nport.ts
# Private history only, not needed on a clean SEC-source branch:
node --import tsx scripts/check-nport.ts --private-issuer
```

Offline commands need no credentials/shared cache. Opt-in commands:
`check-nport.ts --capture` (N-PORT), `--capture-trusts` (SEC SPY/DIA submissions and
reports), `--adopt-submissions /absolute/B/scripts/fixtures/sec-edgar` (no network,
immutable exact reuse), and `seed-etfs.mjs --capture-mappings` (OpenFIGI).
`check-nport.ts --live` checks all 18 SEC holdings sources and one keyless mapping
under one shared bounded lock. It no longer fetches restricted SSGA workbooks.

Follow `.devin/skills/aperture-workstream/SKILL.md`: credentials only through
Node's absolute `--env-file`, explicitly blank all listed remote DB/KV/Gemini
variables, `APERTURE_LOCAL_VERIFICATION=1`, and `APERTURE_CACHE_DIR` only for live
runs. `captureFixture` locks itself: never nest its lock. Immutable fixture names
pin this snapshot; new snapshots need new names/selection, not overwritten dates.

OpenFIGI uses <=10 jobs per request, US exchange constraint, >=2.6s spacing;
filenames hash exact ordered requests. Regeneration verifies digests and response
lengths. CUSIP then ISIN; ambiguous symbols/classes, non-equities and unmatched
historical corporate actions stay unresolved. SEC fallback uses exact unique
issuer/security title, never fuzzy matching. The retained failed real iShares
HTML response remains a private-only rejection fixture, not IVV holdings. The
default rejection check instead uses the real SEC trust HTML as non-NPORT input.

## Historical integrator / D requirements (before public integration below)

- `src/lib/shock/graph.ts:67-69`: replace legacy string-weight casts with canonical
  `validateSeed`/`SourcedEtfProfile`. Keep numerical weights as numbers.
- `graph.ts:238,250,285`: remove hardcoded Alpha Vantage/ETF_PROFILE provenance;
  display actual `holdingsSource` form/URL/as-of/retrieval and SIC evidence.
- `graph.ts:311-318`: a partial sourced sector total must subtract ONLY holdings
  actually classified into that sector and already modeled by name. The old
  code subtracts every table-named company assigned to that sector by scenario
  assumptions, including unclassified AMZN/TSLA/NKE/HD. This erroneously clamps
  VOO's real MCD residual to zero (old named subtraction 0.06074825438133 versus
  actual classified named subtraction 0, from sector weight 0.00297773611055).
  Other graph/live aggregation paths must also
  respect partial sector coverage and signed unmatched positions.
- `scripts/check-aperture-release.ts:67` is **unchanged and still meaningful**.
  C's fixture check proves a real positive residual with correct constituent
  intersection. D needs the adapter fix; do not remove/weaken that release test.
- Import/X-Ray owners must expose classification coverage, signed unmatched and
  original evidence; do not turn unclassified exposure into a zero-sector claim.
- Obtain parent TypeScript/security reviews; no nested reviewer agents launched.

## Historical verification on private ws/c (2026-09-27)

- RED: `check-nport.ts` first failed `Every sourced record carries the canonical
  version` (`undefined !== 2`). The new SEC trust fixture tests then failed before
  `trust.ts` existed. GREEN: both default and `--private-issuer` fixture checks
  pass all retained parser tests, canonical rejection cases, sector constituent
  sums, the genuine MCD residual, and independent trust totals/hostile mutations.
- `node scripts/seed-etfs.mjs --check`: PASS, 18/18 generated, zero missing mapping
  batches; no SSGA bytes are read by generation or default fixture checks.
- `npx --no-install next typegen`, `npx --no-install tsc --noEmit`, `npm run lint`,
  `npm run build -- --webpack`, and `git diff --check`: PASS.
- Locked `check-nport.ts --live`: PASS for 16 N-PORT endpoints plus both SEC UIT
  reports and the keyless AAPL mapping, 08:16:52.400Z–08:16:59.439Z. SPY live
  net assets 648531405608 / 503 positions at 08:16:56.195Z; DIA 42843688951 /
  30 positions at 08:16:56.441Z. No Alpha calls or SSGA workbook calls.
- `npm run test:release`: **FAIL**, unchanged `check-aperture-release.ts:67`
  sector-residual assertion due to the D graph intersection bug above. Separate
  `node --import tsx scripts/check-fallbacks.ts`: PASS. This is not a passing
  release; no assertion was removed/weakened and no graph file was edited.
- Remote DB/KV/Gemini variables were explicitly blank for all env-file commands;
  local verification was enabled. All new fixture captures used module helpers
  and the shared bounded lock. No main/shared-helper/other-owner writes or push.

## Public integration on ws/c-public (2026-09-27)

The parent created this branch from `5d0ce3f` and selectively restored the current
SEC-only tree from `f7557f7`, without merging/cherry-picking private history.
**No `scripts/fixtures/issuer-file` directory is present or needed.** Retained
issuer parser code is not a license to capture/publish restricted workbooks.
The quarantine warning above applies to private `ws/c`, not to this new branch.
Rights review of public filing text and OpenFIGI data remains a publication gate.

Parent explicitly authorized the graph and necessary legacy live math changes:

- `shock/graph.ts` now validates the canonical seed, preserves constituent
  classification, and reads quote issuer/form/date/URL from `holdingsSource`.
- Both `shock/graph.ts` and `shock/live.ts` subtract only named constituents
  actually included in a sourced sector aggregate. A scenario's sector label
  is not evidence of membership. For sourced profiles, unknown classification
  cannot subtract from any sector; the genuine legacy aggregate path is retained.
- For D's eventual integration, preserve this exact predicate:
  `h.sector === sector.sector && table.entities[h.ticker]`. Sum original weights
  over that intersection, not over scenario-sector assignments. The measured
  engine in the separate D worktree was not modified.
- Null company sensitivities remain unknown. Graph notes explicitly distinguish
  partial classification and unclassified weight from zero economic risk.
- `scripts/check-sector-residual.ts` independently computes constituent-level
  impacts for all 18 profiles and every research driver, checks graph residuals,
  live impacts/modeled share, SEC data quotes (including N-30D), rule/classification
  disagreement, and absence-as-unknown behavior. The expanded release runner
  discovers the new regression without package/config changes.

RED evidence: full release failed the unchanged `check-aperture-release.ts:67`;
new exact regression failed its missing VOO/MCD residual assertion. Real sector
weight is `0.00297773611055`, old erroneous subtraction `0.06074825438133`, actual
classified/named intersection `0`, correct residual `0.00297773611055`.
GREEN: all 31 standard release scripts passed, including every existing assertion;
no demo constants, golden expectations or tests were removed or weakened.

Public-worktree gates passed: seed `--check` byte reproducibility with no issuer
fixtures, default `check-nport.ts`, `next typegen`, `tsc --noEmit`, ESLint, webpack
production build and `git diff --check`. Independent locked live checks passed
16 N-PORT sources, both trust N-30D schedules, and keyless OpenFIGI AAPL mapping,
2026-09-27T08:38:15.970Z–08:38:22.690Z. SPY: 503 positions/net assets 648531405608
at 08:38:19.598Z; DIA: 30 positions/net assets 42843688951 at 08:38:19.840Z.
No Alpha, remote DB/KV/Gemini, or SSGA requests. Parent must still arrange the
independent TypeScript/security reviews; nested reviewer agents were not used.
