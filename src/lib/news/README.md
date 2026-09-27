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
  serializes requests with 1.2-second gaps and shares Finnhub's exported token
  bucket. Live CLI checks also hold the shared cross-process provider lock.
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
- `receiveFinnhubWebhook(request, {secret, store, handle?})` is ready for G/the
  integrator to wire into `/api/webhooks/finnhub/route.ts` instead of its existing
  unbounded `request.json()` / `after()` sequence. It authenticates before reading,
  bounds bytes/time/depth/items, hashes canonical full delivery content, claims
  atomically, and responds retryable 503 on work/store failure without error leaks.
- `DeliveryStore` MUST be backed by a deployment-wide atomic durable service for
  multiple instances. `createMemoryDeliveryStore` is bounded and tested but only
  process-local: not persistent across restarts or shared across instances.
  There is intentionally no silently selected production default. Production route
  wiring and a durable store are outstanding integration work. Cache invalidation
  and filing refresh are retry-safe, not transactionally exactly-once effects.
  Supply a durable queue as `handle` if fast acknowledgements are required.
- No real webhook registration/delivery, database operations, Alpha Vantage calls,
  or edits to A/B/G/H-owned files were made by these checks. Independent TypeScript
  and security reviews are reserved for the integrator (six-worker limit).

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
  response. Retry capture later when the provider allows it; do not call this a pass.

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
