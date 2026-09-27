# News/event adapters — workstream E

Server-only code. Render headline/source as text, never provider HTML. Educational
research events, not investment advice or predicted prices.

## Integration contract

- `NewsEvent` normalizes source, safe HTTPS link, ticker tags, event type and shared
  retrieval provenance. SEC events carry accession/CIK/form/document evidence.
- `publishedAt` is nullable deliberately: GDELT DOC `seendate` is **observation**
  time, not article publication time. Show `observedAt` as “seen by GDELT”, with
  `timestampBasis: "seen"`. Never turn missing publication time into “published now”.
- `getFinnhubNews`, `getSecCurrentEvents`, `getSecCompanyEvents`, `getMacroEvents`
  fetch only fixed trusted HTTPS endpoints, deny redirects, bound responses to
  2 MiB, and use timeouts. SEC requires configured contact User-Agent. This adapter
  serializes each provider independently with 1.2-second gaps (at most 100 queued
  requests per provider) and shares Finnhub's exported token bucket. Feed assembly
  uses at most four source workers. Live CLI checks still hold the shared
  cross-process provider lock; this does not add a separate downstream quota.
- These fetchers intentionally do not cache. Existing `getCompanyNews` returns
  opaque cached `NewsItem[]` with no retrieval/stale evidence. A/integrator should
  expose an original-provenance envelope and call `adaptCompanyNews(items, ticker,
  evidence)` rather than assigning a fresh retrieval time to a cached array.
  Until then the fresh Finnhub path shares `takeToken` but not that opaque cache.
- `heldTickerFeed` / `forHeldTickers` are B/H integration adapters for the Radar
  vertical feed. Unavailable sources remain explicit `issues`. Atom CIK-to-ticker
  mapping must come from reviewed real issuer data. GDELT driver tags are lexical
  topic matches, **not measured portfolio sensitivity**; only an explicitly
  selected driver lane includes macro events with no ticker tag.
- Company submissions expose recent 8-K and 8-K/A entries (not a complete filing
  history); current Atom defaults to the provider's current 40-entry window.
  Parsers keep actual dates. Consumers should apply their chosen recency window.
- `PROMO` / `isPromoOrOpinion` can replace/extend B's `ic/facts.ts` filter. No
  modifications were made to IC or Radar/UI. This deterministic editorial filter
  is heuristic, not a guarantee of factual accuracy. Original publisher/source
  links remain the evidence, including Finnhub's public article redirect links.
- `/api/webhooks/finnhub/route.ts` now calls `receiveFinnhubWebhook` with the actual
  durable SQL store, not `request.json()` / `after()`. Authentication precedes the
  bounded body read. Only completed receipts ACK retries; active claims return
  503, as do store/work failures. Error responses never expose credentials.
- `supabase/migrations/20260927000200_webhook_deliveries.sql` provides the atomic
  `webhook_delivery` RPC: 120-second leases, UUID token fencing, 24-hour completed
  retention, 100k capacity, and an indexed opportunistic sweep of up to 1000 expired
  rows per claim (also the requested expired key). Capacity/claims serialize under
  a short advisory transaction lock with a one-second lock timeout. Only service
  role can execute; no client role can read/write receipts. The migration has been
  tested ONLY in local PGlite and MUST NOT be remotely applied without separate
  authorization. Before authorized deployment, the route fails closed with 503.
- The default work budget is 20 seconds measured monotonically from before claim
  acquisition, safely below the SQL lease. Timeout aborts cooperative work but
  never explicitly releases a claim until its handler settles. Paused reads check
  the deadline before any further invalidation; stale completion/release cannot
  change a replacement token. Injected handlers must likewise cooperate or fence
  their effects externally, and MUST safely rerun after partial completion.
- Filing events invalidate the SEC filing-list cache; Radar recomputes the new pair
  on its next read. They no longer launch an uncancellable eager Radar/Gemini job.
  Shared `forgetKeys` persistence is still best-effort/asynchronous; durable receipts
  do not make shared cache writes transactional or guarantee deployment-wide cache
  coherence. G/integrator owns any stronger invalidation/flush semantics.
- `createMemoryDeliveryStore` is an explicitly injected test/local helper only:
  bounded, but process-local, non-durable and without expired-inflight recovery.
  The route never selects memory, even in local-verification mode. Both isolation
  flags refuse remote store access. No generalized exactly-once guarantee is made.
- Webhooks and news share the same normalized ticker domain (digits, class shares,
  up to ten characters). Holdings normalize class-share aliases. Explicit no-account
  mode is empty; partial configuration, HTTP/transport or malformed responses fail
  processing rather than pretending nobody holds the event's ticker.
- No real webhook registration/delivery, remote database operations, Alpha Vantage
  calls, or edits to A/B/G/H shared modules were made. Only the additionally
  authorized webhook route/migration changed outside the original E ownership.
  Independent TypeScript/security re-review remains for the integrator; no nested
  reviewers were launched.

## Recorded evidence (2026-09-27 UTC)

All captures used `captureFixture` directly (its own lock; no nested lock), Node's
absolute env-file option, explicit blank Supabase/KV/Upstash/Gemini variables and
`APERTURE_CACHE_DIR=/Users/zakariakhan/.cache/aperture-shared`. The recorder validates
credential safety and SHA-256; the offline parsers load with digest verification.
Offline checks do not access provider caches or remote services.

| Fixture | Retrieval time | SHA-256 |
| --- | --- | --- |
| `scripts/fixtures/finnhub/news-aapl.json` | `2026-09-27T07:14:23.672Z` | `35760cd9ade1193a0e9916a36324a70b4839f3fa1cc83a0eada2d5ddfac1b3df` |
| `scripts/fixtures/sec-edgar/news-aapl-submissions.json` | `2026-09-27T07:14:25.033Z` | `dabb28a7c4af8fac408a72345ec959c1a08255a6c5c1af99c4f22b2beacfc77f` |
| `scripts/fixtures/sec-edgar/news-current-8k.json` | `2026-09-27T07:14:26.487Z` | `cd3b1f70d2fc42cd387d24aaadbb49a780d2e1d50e2a8b3b366c87a893cd5ced` |

Locked live checks returned:

- Finnhub AAPL: 227 retained stories, retrieved `2026-09-27T07:27:32.623Z` after
  filtering. Example headline: “Guess Which Group of Stocks Is Back at an All-Time
  High?”, publication `2026-09-26T15:27:00.000Z`, public link
  `https://finnhub.io/api/news?id=4f5defc81f8010b9fad362a7d3652e507bdcae3903427d40d98caaf521341c4b`.
- Apple SEC submissions: 105 recent 8-K/8-K/A entries, retrieved
  `2026-09-27T07:19:10.140Z`; latest `8-K/A`, accepted
  `2026-09-01T20:30:35.000Z`, accession `0001140361-26-035325`, original document
  `https://www.sec.gov/Archives/edgar/data/320193/000114036126035325/ef20081427_8ka.htm`.
- SEC current Atom: 40 entries, retrieved `2026-09-27T07:19:11.449Z`; first
  United States 12 Month Natural Gas Fund, LP, accepted `2026-09-25T21:30:12.000Z`,
  accession `0002071876-26-000224`, original filing index
  `https://www.sec.gov/Archives/edgar/data/1405513/000207187626000224/0002071876-26-000224-index.htm`.
- **GDELT BLOCKED**: two recorder attempts returned HTTP 429 (second at
  `2026-09-27T07:16:51.821Z`); complete locked live suite again reported HTTP 429 at
  `2026-09-27T07:19:23.301Z` and exited 1. No fake GDELT fixture was substituted.
  The implemented DOC parser remains unverified against a captured successful
  response. The parent's fresh retry after long backoff still failed at transport;
  this follow-up made no new live calls or retry attempts. No successful GDELT
  fixture exists; the complete gate remains blocked, not passed.

## Verification

- RED: both scripts failed for missing implementation modules. Subsequent targeted
  RED checks exposed real “Better Buy” promotional content and unrelated-issuer
  fuzzy deduplication; malformed webhook data returned 200 before schema hardening.
- GREEN (available providers): `node --import tsx scripts/check-news.ts
  --available-fixtures` verifies 227 retained Finnhub stories, 105 company filings,
  40 Atom entries, original/stale dates, safe source URLs, forged endpoint refusal,
  future/invalid time rejection, promo/opinion filtering, exact/near deduplication,
  issuer/date/number/negation distinctions and explicit partial feed errors.
- `node --import tsx scripts/check-news.ts` deliberately exits **1** while the GDELT
  fixture is missing. `--available-fixtures` is explicitly a partial gate, not full
  provider acceptance. `--live` holds the complete-check lock and fails on any
  blocked provider. `--live --provider=finnhub` narrows regression checks without
  repeatedly probing the blocked GDELT API.
- `node --import tsx scripts/check-webhook.ts`: existing assertions preserved plus
  local Request tests for auth, input bounds/depth/schema, concurrent/reordered
  replay, distinct deliveries, retry-on-failure, async invalidation failure, capacity
  and TTL. `--live` is intentionally the same local safety suite; **not** external
  webhook delivery. Envelope tests wrap actual recorded Finnhub company-news items;
  they are not claimed to be captured real webhook deliveries.
- Follow-up RED: digit/ten-character tickers were dropped; the durable store module
  was missing; a slow feed blocked independent sources; a delayed claim response
  incorrectly reset the work budget and returned 200. All now pass regression tests.
- `node --import tsx scripts/check-webhook-store.ts` executes the exact migration in
  local PGlite and routes actual Request objects through `POST` using an intercepted
  SQL RPC transport (never a remote connection). Covers competing claim adapters,
  busy retries, expired leases, stale-token complete/release, 100k capacity, bounded
  retention sweep, anonymous/authenticated privilege denial, route body limits,
  unavailable storage, isolation, and timeout without prematurely releasing work.
  PGlite serializes queries: this is actual SQL testing, not a multi-host load test.
- `check-webhook.ts` also covers partial-completion replay, held symbols with digits
  and class shares, configured holdings failures, aborted reads and delayed claims.
  `check-news.ts` adds four-worker/source independence and dedup bucket boundary/
  alias regressions. Dense same-issuer/day fuzzy matching remains worst-case
  quadratic under the existing 10k input cap; unrelated buckets are no longer scanned.
- Final `npx --no-install next typegen`, `npx --no-install tsc --noEmit`,
  `npm run lint` and `npm run test:release` all exited **0** in this worktree.
  No production build or independent nested review was run. See the handoff for
  commit SHA. The missing GDELT fixture and blocked complete live check still
  prevent full workstream acceptance regardless of the passing code gates.
- Shared provenance URL sanitization removes SEC Atom action/output/type and GDELT
  query/mode/timespan parameters; trusted host/path remains in evidence. The exact
  fixed requests are exported as `SEC_CURRENT_URL` and `GDELT_MACRO_URL`. Integrator
  may extend the shared approved-parameter contract for reproducible query links;
  this workstream did not weaken that shared safety allowlist.
