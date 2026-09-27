> Historical planning document. Scope, infrastructure and milestones below are proposals, not claims about the shipped app. See README.md and DEMO.md for current behavior.

# PRD: Aperture

ShellHacks 2026 | Blackstone sponsor challenge + Best Use of Gemini API | Web app
Team: Gui (frontend lead, React/Next.js), Josh (Backend), Luiz (Backend), Zakaria (Backend)
**Hard deadlines (Sept 27, 2026):** last git commit 10:59 AM (repo locks), Devpost due 11:00 AM, judging early afternoon.

---

## 1. App Overview and Objectives

**One-liner:** Aperture shows investors what they actually own, what changed in the companies they own, and runs an AI investment committee on anything they are considering.

**Problem (from the challenge):** Filings, performance data, market data and news live in different places. Retail investors cannot turn that into insight.

**Four pillars:**
1. **X-Ray** (understand what you own): look through ETFs into underlying companies. Reveal hidden overlap, concentration and sector exposure.
2. **Filing Radar** (what changed): compare each holding's latest SEC filing to the prior one and surface new or changed risks in plain English.
3. **IC Room** (research what is next): a bull agent and a bear agent debate a ticker using filings, fundamentals and news, then a "chair" writes a one-page investment committee memo.
4. **Shock Test** (stress what you own): pick or describe a shock ("commercial real estate falls 20%") and see how it propagates through companies into your portfolio, with evidence on every link.

Plus **Snap Import** (screenshot your brokerage, Gemini reads it) and **Ask** (natural language chat grounded in the user's own portfolio).

**Hackathon objectives:**
- Win the Blackstone challenge and Best Use of Gemini API. Stretch: Best Overall.
- Live demo in under 3 minutes with zero dependency on flaky live calls (demo portfolio fully pre-cached).
- Every AI claim is traceable to a source (filing excerpt, data point, or web citation).

**Core principle (borrowed from Ollie):** the LLM explains, it never decides. Numbers come from deterministic code (X-Ray math, XBRL facts); Gemini only writes narrative on top of them and must cite fact ids. Every AI output is stored with the exact inputs that produced it (audit trail).

**Explicit non-goals:**
- Buy/sell recommendations or trade execution.
- Brokerage linking (Plaid, Robinhood MCP).
- Hardware.
- Native mobile app (web is responsive instead).

---

## 2. Target Audience

Three personas, mapped to the experience level chosen at onboarding (section 3.0).

**Persona 1: "First-timer Fran" (Beginner)**
- Age 18 to 30. Has never bought a stock, or just opened a brokerage account.
- Wants to "get into trading" but is overwhelmed by jargon and afraid of a bad first move.
- Needs: plain-language explanations, a safe Practice Portfolio with no real money, and a habit of researching before buying.
- Framing: the product teaches research and long-term thinking. It never tells Fran what to buy and has no trading features.

**Persona 2: "Self-directed Sam" (Intermediate)**
- Age 20 to 35, has a brokerage account (Robinhood, Fidelity, Schwab).
- Owns 3 to 15 positions: a few ETFs (VOO, QQQ, VTI) plus individual stocks (NVDA, AAPL, TSLA).
- Never reads 10-Ks. Does not realize VOO + QQQ + NVDA means heavy NVDA concentration.
- Wants to feel informed, not overwhelmed.

**Persona 3: "Analyst Alex" (Advanced)**
- Reads earnings releases and follows valuation. Owns a larger, more concentrated portfolio.
- Wants speed and density: raw figures, quarter-over-quarter deltas, full filing excerpts, no hand-holding.

Covering all three levels is itself a pitch point: the challenge asks for information that is more accessible and more actionable, for everyone from Fran to Alex.

**Judge persona:** Blackstone investment professionals. They live in IC memos, risk factors and look-through exposure. Product pitch: "Blackstone's analyst toolkit, rebuilt for everyone."

---

## 3. Core Features and Functionality

Priority legend: **P0** = must ship for demo, **P1** = ship if on schedule, **P2** = stretch.

### 3.0 Onboarding and Experience Level (P0)

**Flow (right after sign-in or "Try the demo"):**
1. Required single-choice question: **"What's your investing experience?"**
   - **Beginner:** "I haven't bought my first stock yet, or I just started."
   - **Intermediate:** "I own a few stocks or ETFs and check on them sometimes."
   - **Advanced:** "I read earnings and filings and follow valuation."
2. Routing:
   - Beginner: "Do you own any investments yet?" Yes goes to Import (3.1). No goes to **Practice Portfolio** (below).
   - Intermediate and Advanced: go straight to Import (3.1).
3. Level is saved to `profiles.experience_level` and can be changed anytime from a level switcher in the top bar.

**Practice Portfolio (P0, beginner path):**
- Pick a starter template or build one from tickers they are curious about with a hypothetical amount (default $1,000).
- Starter templates (all tickers pre-seeded): "Just the market" (VOO), "Tech curious" (QQQ, AAPL, NVDA), "Dividend starter" (SCHD, JNJ, KO).
- Stored as `portfolios.kind = practice`. X-Ray, Radar, IC Room and Ask all work on it exactly as on a real portfolio.
- Clearly labeled "Practice: no real money." No brokerage links and no buy buttons.

**How the app adapts by level** (the deterministic numbers are identical at every level; only presentation and Gemini's explanation depth change):
- **Beginner:** glossary tooltips on every finance term (ETF, 10-K, risk factor, concentration, overlap); "What does this mean?" explainer under each headline; Learn cards on X-Ray (e.g. "Why concentration matters"); Radar shows high and medium severity only; IC memo in plain language with a "Key terms" box; Ask chips include "What is an ETF?" and "How do I research a stock before buying?"
- **Intermediate:** the default views described in 3.2 to 3.5.
- **Advanced:** denser layout, raw figures (XBRL values, quarter-over-quarter deltas), source excerpts expanded by default, all severities, full ETF overlap matrix, no tooltips.

**Acceptance criteria:**
- A new user cannot reach the dashboard without choosing a level.
- A beginner with no holdings reaches a populated X-Ray in under 60 seconds via a starter template.
- Switching level re-renders the current page in under 3 seconds when cached.
- Every finance term on beginner views has a tooltip.

**Technical considerations:**
- Every Gemini call takes a `level` parameter. Prompt templates include a level-specific style block (reading level, jargon allowed, length).
- The structured analysis (Radar diff, IC memo) is generated once per ticker. Level rewrites are a cheap second Gemini pass cached per (ticker, level) to protect free-tier quota.
- Glossary is a static JSON file (~40 terms) written ahead of time, not generated live.
- Level never changes numbers, flags or fact ids.

---

### 3.1 Portfolio Import (P0)

**Three input methods:**
1. **Snap Import (P0, Gemini hero feature):** user drags in 1 to 3 screenshots of their brokerage positions screen. Gemini vision extracts holdings.
2. **CSV upload (P0 fallback):** columns `ticker` (required), `shares` (required), `cost_basis_per_share` (optional). Map common broker headers (`Symbol` to `ticker`, `Quantity` to `shares`).
3. **Manual entry (P0):** ticker autocomplete from `securities` table + shares.

Plus **Load Demo Portfolio** button (one click, everything pre-cached).

**Snap Import flow:**
```
user drops image(s) -> POST /portfolio/snap (multipart)
backend -> Gemini Flash (image + prompt + JSON response schema):
    extract [{ticker, shares, market_value?}]; ignore account numbers, names, balances
validate tickers against securities table
return preview table -> user edits/confirms -> POST /portfolio/import
image is discarded after extraction (never stored)
```

**Acceptance criteria:**
- Snap Import extracts holdings from a Robinhood or Fidelity positions screenshot with at least 90% of rows correct; user can fix rows in a preview table before saving.
- CSV of up to 50 rows imports in under 3 seconds; invalid tickers are listed, valid rows still import.
- Demo Portfolio loads in one click and all pillars show cached results.

**Technical considerations:**
- If Gemini returns only market value (no share count), compute `shares = market_value / price`.
- Pre-test Snap Import with 3 real screenshots (Robinhood, Fidelity, Schwab) before the demo; keep the best one in the demo script.

---

### 3.2 X-Ray (P0)

**Outputs:**
- Total portfolio value.
- **True Top 10 exposures:** underlying companies ranked by combined weight across direct holdings and ETF look-through.
- **Hidden concentration headline:** e.g. "NVDA is 3 separate positions and 18% of your money."
- **Sector breakdown** (donut chart).
- **ETF overlap score** per ETF pair (e.g. "VOO and VTI overlap 87%").
- Flags: any single company above 10%, any sector above 35%.
- **Performance chart (P1):** portfolio value over 1M / 6M / 1Y, plus each holding's return. Built from daily candles (Finnhub `/stock/candle` if the free key allows it; otherwise Alpha Vantage daily series for demo tickers, cached). The challenge explicitly mentions visualizing performance.
- Company logos and industry from Finnhub `/stock/profile2` on every holding row.
- One-paragraph Gemini summary of the X-Ray, citing the computed numbers only.

**Algorithm (pseudocode):**
```
exposure = {}
for holding in portfolio:
    value = holding.shares * price(holding.ticker)
    if holding.type == ETF:
        for c in etf_constituents(holding.ticker):
            exposure[c.ticker] += value * c.weight
            exposure[c.ticker].sources.append(holding.ticker)
    else:
        exposure[holding.ticker] += value
        exposure[holding.ticker].sources.append("direct")
normalize exposure by total portfolio value
overlap(A, B) = sum over tickers of min(weightA[t], weightB[t])
```

**Acceptance criteria:**
- Demo portfolio X-Ray renders in under 2 seconds.
- Each exposure row shows its sources (e.g. "Direct, VOO, QQQ").
- Flags appear when thresholds are crossed.

**Technical considerations:**
- ETF constituents from Alpha Vantage `ETF_PROFILE` (tight free rate limit). **Pre-seed** ~20 popular US ETFs at kickoff. Never call it live in the demo.
- Unseeded ETF shows as opaque with a "look-through unavailable" badge.
- Prices from Finnhub `/quote`, cached 15 minutes.

---

### 3.3 Filing Radar (P0)

**Description:** for each stock the user holds directly or as a top-10 X-Ray exposure, compare the newest 10-K/10-Q to the prior one of the same type and summarize what changed.

**Radar card contents:**
- Filing type, date, link to SEC.gov.
- **New**, **removed**, **materially changed** risks, each with: one-sentence summary, "why it matters to you" tied to exposure %, severity (`low | medium | high`), and a tappable source excerpt.
- Recent 8-K events summarized in one line each (P1).

**Pipeline:**
```
ticker -> CIK (SEC company_tickers.json)
submissions = GET data.sec.gov/submissions/CIK##########.json
latest, prior = two most recent filings of same form type
text = fetch filing HTML -> plain text
section = "Item 1A. Risk Factors" (10-K) or MD&A + Item 1A (10-Q)
diff = Gemini(prior section, latest section, JSON schema)
store in filing_diffs
```

**Acceptance criteria:**
- Demo portfolio shows at least 4 pre-computed Radar cards, sorted by severity.
- Every risk item has a source excerpt the user can open.
- "Refresh" re-runs one ticker in under 60 seconds.

**Technical considerations:**
- SEC requires a descriptive `User-Agent` with contact email and max 10 requests/second.
- Many 10-Qs say "no material changes" to risk factors; diff MD&A too. Prefer 10-K vs 10-K for demo cards.
- Regex section extraction first; fallback sends the whole filing to Gemini (long context) to locate the section.
- Enforce JSON with a response schema; retry once on invalid output.

---

### 3.4 IC Room (P0)

**Description:** user enters any ticker (owned or not). Three Gemini roles produce an investment committee memo.

**Roles:** Bull analyst, Bear analyst (sees bull case, rebuts), Chair (writes memo).

**Fact pack (built by backend before any debate call):**
- Fundamentals from SEC XBRL `companyfacts` (revenue, net income, operating cash flow, total debt, last 8 quarters).
- Latest Filing Radar diff (generate if missing).
- **Recent news via Gemini + Google Search grounding** (last 14 days), keeping the returned web citations. Finnhub `/company-news` is the fallback.
- User context: current exposure to this ticker from X-Ray.
- Every fact gets an id (`F1`, `F2`, ...), web facts keep their URL.

**Memo output (JSON, rendered as a styled document card):**
- `thesis_summary` (2 sentences)
- `bull_points[]`, `bear_points[]` (each with `fact_id`)
- `key_risks[]`, `what_to_watch[]`
- `portfolio_fit`: how buying would change concentration (computed by X-Ray code, not the LLM)
- `stance`: `Worth deeper research | Neutral | Proceed with caution` (never Buy/Sell)

**Acceptance criteria:**
- UI reveals bull, then bear, then chair (streamed) so the demo feels live.
- Points citing a missing `fact_id` are dropped server-side.
- New ticker completes in under 30 seconds; demo tickers are instant.
- Footer: "Educational tool. Not investment advice."

**P2: Listen mode.** Bull and bear read aloud in two voices via Gemini TTS; fallback to browser Web Speech API with two different voices.

**Technical considerations:**
- Grounded search call and the structured JSON call are separate steps (do not rely on combining search grounding with a response schema in one request).
- Pre-cache memos for 3 demo tickers (one owned, one not owned, one with a dramatic bear case).

---

### 3.5 Ask (P1)

**Description:** chat panel that answers questions about the user's portfolio.

**Suggestion chips:** "What's my biggest risk?", "How much of my money is in AI?", "What changed in Apple's latest filing?"

**Approach:** context stuffing, no vector DB. Send Gemini a compact JSON of X-Ray results, Radar highlights and cached memos. Answers must reference provided data or say "I don't have data on that." Declines buy/sell questions and links to IC Room.

**Acceptance criteria:** answers in under 8 seconds; streamed.

---

### 3.6 Authentication (P1, with fallback)

- **Decision:** Google sign-in via Supabase Auth (fastest on web, fits the Google/Gemini story).
- Setup: Google Cloud OAuth client (Web), authorized redirect = Supabase callback URL, add the Vercel production domain and `localhost:3000` to Supabase redirect allow list.
- **"Try the demo"** button signs into a shared demo account. This is the stage path.
- Profile fields: `id (uuid)`, `email (string)`, `display_name (string)`, `avatar_url (string, nullable)`, `experience_level (beginner | intermediate | advanced)`, `created_at`.

**Acceptance criteria:** session persists across refresh; demo path works even if OAuth is misconfigured.

---

### 3.7 Shock Test (P1)

**Description:** "What happens to my portfolio if...?" User picks a scenario pack or types a shock in plain English. The shock engine propagates it through a curated company graph, and the result is mapped onto the user's X-Ray exposures.

**Scenario packs:**
- Commercial real estate decline (primary, and the Blackstone story).
- Oil price shock (secondary).
- Free text: Gemini parses it into a supported shock driver; unsupported shocks get a clear "not modeled yet" message.

**Outputs:**
- Headline (deterministic): "A 20% commercial real estate decline would move your portfolio about -4.1%."
- Severity slider (5% to 40%) that recomputes instantly.
- Top 5 hit holdings with impact and the path that got them there (e.g. "CRE decline -> regional bank loan books -> KRE -> you").
- Propagation graph (Cytoscape) with an evidence drawer per edge: source filing, quoted passage, derivation method.
- Holdings outside the model listed separately under "Not modeled" so the headline is never presented as complete.
- Level adaptation: Beginner gets the chain explained in plain words ("what is commercial real estate?"); Advanced sees edge weights and derivation method ids.

**Algorithm:** Gemini finds the evidence sentence for each edge; a registered derivation method (e.g. credit exposure, commodity sensitivity, concentration) turns it into the edge weight. Propagation and portfolio mapping are deterministic:
```
scenario = parse_shock(text) or pack                       # Gemini Flash -> Pydantic Scenario
entity_impact = shock_engine.propagate(scenario, severity) # deterministic, snapshot-bound
for ticker, weight in xray.exposures:                      # look-through, incl. ETF constituents
    if ticker in entity_impact:
        portfolio_impact += weight * entity_impact[ticker]
        paths[ticker] = shock_engine.paths_to(ticker)
    else:
        unmodeled.append(ticker)
```

**Acceptance criteria:**
- CRE pack on the demo portfolio returns in under 2 seconds; slider updates in under 300 ms.
- Every graph edge opens evidence with a real source passage.
- Same inputs (snapshot + scenario + severity) always produce the same number.
- Gemini never produces or adjusts any weight or impact number.

**Technical considerations:**
- Graph lives in memory (NetworkX), loaded at startup from Postgres `shock_entities` and `shock_edges`. No separate graph database or cache server.
- Shock parsing uses Flash with a strict Pydantic schema and an enum of supported drivers.
- Coverage is limited to the curated entity universe. Pick the universe and the demo portfolio together so the CRE story lands (e.g. a regional bank ETF, a REIT, BX).
- Slider: if the engine is linear in severity, return impacts at unit severity and scale in the browser; otherwise debounce calls to `/shock/run`.

---

## 4. Best Use of Gemini API (judging checklist)

| Gemini capability | Where it is used |
|---|---|
| Vision (image understanding) | Snap Import of brokerage screenshots |
| Long context | Full 10-K text when section extraction fails; prior vs latest filing diff |
| Structured output (JSON schema) | Radar diffs, IC memos, Snap Import extraction |
| Grounding with Google Search | Recent news in the IC Room fact pack, with web citations |
| Multi-agent orchestration | Bull, Bear, Chair roles in IC Room |
| Streaming | IC Room reveal and Ask chat |
| TTS (P2) | IC Room Listen mode |
| Level-adaptive generation | Same facts rewritten for beginner, intermediate or advanced readers |
| Natural language shock parsing + provenance extraction | Shock Test: "office values drop 20%" becomes a structured scenario; Gemini locates evidence sentences for graph edges |

**Free tier constraints:**
- Use Flash-class models only (Pro models are not reliably free).
- Rate limits are per Google Cloud project: **each backend dev creates their own AI Studio project and key.** Route feature-specific traffic to separate keys (Radar key, IC key, Import/Ask key).
- Confirm in AI Studio at kickoff that search grounding and TTS are enabled on the free tier; if not, fall back to Finnhub news and Web Speech API.
- Free tier data may be used by Google to improve products; acceptable because only public market data and user-confirmed tickers are sent (never screenshots with account info stored).
- Wrap every call in exponential backoff on 429 and serve cached results first.

---

## 5. Technical Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS | Gui's React/Tailwind experience; fast to build polished UI |
| UI components | shadcn/ui + Recharts | Clean finance look, donut/bar charts out of the box |
| Frontend hosting | Vercel | Instant deploys and preview URLs from GitHub |
| Backend API | Python 3.11+, FastAPI, Pydantic v2 on Railway | Strong SEC/XBRL, graph and data tooling; Pydantic models double as Gemini response schemas; FastAPI's auto OpenAPI spec generates typed frontend clients; no serverless timeouts |
| Backend libraries | `google-genai` (Gemini), `finnhub-python`, `httpx`, `sse-starlette` (streaming), `networkx` (shock graph), `PyJWT` (Supabase JWT), `asyncpg` or SQLAlchemy | Official SDKs, minimal glue |
| Frontend API types | `openapi-typescript` generated from FastAPI's `/openapi.json` | Gui gets typed requests without waiting on backend docs |
| Graph visualization | Cytoscape.js | Shock Test propagation graph |
| Database + Auth | Supabase (Postgres, Auth, Row Level Security, Realtime) | One service for data and Google sign-in |
| AI | Gemini API, Flash model, free tier | Vision, grounding, structured output, long context |
| Filings + fundamentals | SEC EDGAR APIs (free, no key) | Primary source data; credibility with Blackstone judges |
| Market data | Finnhub (free key, ~60 calls/min) | Quotes, company profile (industry, logo), basic metrics, company news, earnings calendar, recommendation trends, candles if free; webhooks for live events |
| ETF holdings | Alpha Vantage `ETF_PROFILE` (free key, seed once) | Only practical free constituents source |
| Macro | FRED API (free key) | Shock Test inputs (e.g. oil prices, CRE price indexes, rates) |

**Architecture:**
```
[Next.js on Vercel] --HTTPS/JSON + Supabase JWT--> [FastAPI on Railway] --> [Supabase Postgres]
        |                                                 |
        +-- Supabase Auth (Google / demo)                 +--> SEC EDGAR (filings, XBRL)
                                                          +--> Finnhub (quotes, profile, metrics, news, earnings; webhooks in)
                                                          +--> Alpha Vantage (ETF seed only)
                                                          +--> Gemini (vision, grounding, JSON, streaming)
                                                          +--> FRED (Shock Test inputs)
                                                          +--> in-memory shock graph (NetworkX)
```
- All third-party API keys live on the FastAPI service only.
- Browser uses Supabase anon key + user JWT; FastAPI verifies the JWT on every request (PyJWT against Supabase's JWT secret/JWKS).
- Streaming endpoints (`/ic`, `/ask`) use Server-Sent Events via `sse-starlette`.
- Every request/response and every Gemini output is a Pydantic model; the frontend regenerates TS types from `/openapi.json` whenever the contract changes.

**API contract (agree in the first hour; frontend builds against mock JSON of these shapes):**

| Method | Path | Purpose |
|---|---|---|
| POST | `/portfolio/snap` | Multipart images. Returns extracted holdings preview |
| POST | `/portfolio/import` | CSV text or `[{ticker, shares, cost_basis}]`. Returns holdings + invalid tickers |
| POST | `/portfolio/demo` | Loads demo portfolio |
| POST | `/portfolio/practice` | Body: `{template_id}` or `{tickers[], amount}`. Creates Practice Portfolio |
| PATCH | `/profile` | Body: `{experience_level}` |
| GET | `/portfolio` | Holdings with prices |
| GET | `/xray` | Exposures, sectors, overlaps, flags, summary |
| GET | `/radar` | Radar cards |
| POST | `/radar/:ticker/refresh` | Re-run one ticker |
| POST | `/ic/:ticker` | SSE stream: bull, bear, memo (cached if exists) |
| POST | `/ask` | SSE stream answer |
| GET | `/shock/scenarios` | Available scenario packs |
| POST | `/shock/run` | Body: `{scenario_id}` or `{text}`, plus `severity`. Returns portfolio impact, per-holding impacts, paths, graph nodes/edges with evidence ids, unmodeled tickers |
| POST | `/webhooks/finnhub` | Finnhub event receiver (P2). Verifies `X-Finnhub-Secret`, returns 200 immediately, queues refresh of news/Radar for held tickers |

**Finnhub integration:**
- Source of truth for endpoints: the OpenAPI spec at https://finnhub.io/static/swagger.json. Use the official `finnhub-python` client; check the spec for response fields.
- Endpoints used: `/quote` (prices), `/stock/profile2` (name, industry, logo, market cap), `/stock/metric?metric=all` (P/E, 52-week range, beta for IC fact pack and Advanced view), `/company-news` (news, fallback to Gemini grounding), `/calendar/earnings` ("what to watch" in IC memos), `/stock/recommendation` (analyst trend as one fact in the pack), `/stock/candle` (performance chart, if free), `/search` (ticker autocomplete).
- **First 15 minutes:** hit every endpoint above with the team key and record which return 403 (premium). Adjust features before building on them.
- Scope is US-listed stocks and ETFs only. The Finnhub exchanges sheet is only needed if non-US tickers are added later.
- Rate limit: one shared server-side Finnhub client with a token bucket (~50 calls/min to stay under the limit) and a Postgres cache (quotes 15 min, profiles and metrics 24 h, news 1 h).
- Webhooks (P2): register the Railway URL `/webhooks/finnhub` in the Finnhub dashboard; reject any request whose `X-Finnhub-Secret` header does not match `FINNHUB_WEBHOOK_SECRET`; acknowledge with 200 before doing work.

**Docs:**
- Gemini API: https://ai.google.dev/gemini-api/docs
- Gemini image understanding: https://ai.google.dev/gemini-api/docs/image-understanding
- Gemini structured output: https://ai.google.dev/gemini-api/docs/structured-output
- Gemini grounding with Google Search: https://ai.google.dev/gemini-api/docs/google-search
- Gemini rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
- SEC EDGAR APIs: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- Finnhub: https://finnhub.io/docs/api
- Finnhub OpenAPI spec: https://finnhub.io/static/swagger.json
- Alpha Vantage: https://www.alphavantage.co/documentation/
- Supabase Google login: https://supabase.com/docs/guides/auth/social-login/auth-google
- Next.js: https://nextjs.org/docs
- shadcn/ui: https://ui.shadcn.com
- Recharts: https://recharts.org

---

## 6. Conceptual Data Model

**users** (Supabase Auth) + **profiles**
- `id` uuid PK (= auth user id), `display_name` text, `avatar_url` text nullable, `experience_level` enum(`beginner`,`intermediate`,`advanced`), `onboarded_at` timestamptz nullable, `created_at` timestamptz

**portfolios**
- `id` uuid PK, `user_id` uuid FK, `name` text, `kind` enum(`real`,`practice`,`demo`), `created_at` timestamptz

**holdings**
- `id` uuid PK, `portfolio_id` uuid FK, `ticker` text FK securities, `shares` numeric, `cost_basis_per_share` numeric nullable, `source` enum(`snap`,`csv`,`manual`,`demo`), `created_at` timestamptz

**securities** (shared)
- `ticker` text PK, `cik` text nullable, `name` text, `type` enum(`stock`,`etf`), `sector` text nullable, `last_price` numeric, `price_updated_at` timestamptz

**etf_constituents** (shared, seeded)
- `etf_ticker` text FK, `constituent_ticker` text, `weight` numeric (0 to 1), `as_of` date. PK (`etf_ticker`, `constituent_ticker`)

**filings** (shared cache)
- `id` uuid PK, `ticker` text, `accession_number` text unique, `form_type` text, `filed_at` date, `url` text, `section_text` text

**filing_diffs** (shared cache)
- `id` uuid PK, `ticker` text, `latest_filing_id` uuid FK, `prior_filing_id` uuid FK, `result_json` jsonb, `model` text, `created_at` timestamptz

**ic_memos** (shared cache, audit trail)
- `id` uuid PK, `ticker` text, `fact_pack_json` jsonb, `bull_json` jsonb, `bear_json` jsonb, `memo_json` jsonb, `model` text, `created_at` timestamptz

**level_rewrites** (shared cache)
- `id` uuid PK, `source_type` enum(`radar`,`ic_memo`,`xray_summary`), `source_id` uuid, `level` enum(`beginner`,`intermediate`,`advanced`), `content_json` jsonb, `created_at` timestamptz. Unique (`source_type`, `source_id`, `level`)

**shock_entities** (shared, curated universe)
- `id` text PK, `ticker` text nullable, `name` text, `entity_type` text (company, sector, asset class, macro driver)

**shock_edges** (shared, every edge carries provenance)
- `id` uuid PK, `source_entity` text FK, `target_entity` text FK, `weight` numeric, `derivation_method` text (e.g. `DER-CREDIT`), `evidence_doc_id` text, `evidence_passage` text, `evidence_offsets` int4range, `data_timestamp` timestamptz, `confidence` numeric, `snapshot_id` text

**shock_runs** (audit trail)
- `id` uuid PK, `user_id` uuid FK nullable, `portfolio_id` uuid FK, `scenario_json` jsonb, `severity` numeric, `snapshot_id` text, `result_json` jsonb, `engine_version` text, `created_at` timestamptz

**chat_messages**
- `id` uuid PK, `user_id` uuid FK, `role` enum(`user`,`assistant`), `content` text, `created_at` timestamptz

**Relationships:** user 1:N portfolios 1:N holdings N:1 securities; ETF securities 1:N etf_constituents. Filings, diffs and memos are shared across users (public data), which saves Gemini quota.

**Row Level Security:** `profiles`, `portfolios`, `holdings`, `chat_messages` restricted to `user_id = auth.uid()`. Shared tables read-only to clients; writes only via backend service role.

---

## 7. UI Design Principles

- **Design standard:** every frontend implementation follows the Claude Code skills `/gui-dev-toolkit:emil-design-eng` (Emil Kowalski's design engineering principles) and `/gui-dev-toolkit:apple-design` (Apple's design principles). Invoke both before building each page or component. shadcn/ui is only the primitive layer; spacing, typography, color and motion come from these skills. Any backend teammate helping on frontend uses the same skills.
- **Desktop-first for judging** (projector), fully responsive down to phone width.
- **Layout:** left sidebar nav (X-Ray, Radar, IC Room, Shock Test), top bar with portfolio value, Ask as a slide-over panel from any page.
- **Lead with the insight:** each page opens with one big sentence ("18% of your money is NVDA") before charts.
- **Every AI statement has a source chip** that opens a drawer with the excerpt, SEC link or web citation.
- **IC Room feels like a meeting:** bull and bear as two speakers in distinct colors, then the memo slides in as a document.
- **Severity colors:** high = red, medium = amber, low = gray. Consistent everywhere.
- Dark mode default (reads well on projectors), light mode supported.
- Loading states narrate the work ("Reading Apple's 10-K...", "Searching today's news...").
- Accessibility: keyboard navigable, chart data also available as a table toggle, WCAG AA contrast.

**Pages:**
1. Landing: one-line pitch, "Try the demo", "Sign in with Google".
2. Onboarding: experience level picker (three large cards), then beginner routing question.
3. Practice Portfolio builder (beginners without holdings): starter templates or pick tickers + amount.
4. Import: Snap drop zone (hero), CSV upload, manual add, preview/confirm table.
5. X-Ray: headline, True Top 10, sector donut, overlap cards, flags, Learn cards (beginner).
6. Radar: severity-sorted cards; card detail with new/removed/changed risks.
7. IC Room: ticker search, debate view, memo card, (P2) Listen button.
8. Shock Test: scenario picker or free-text box, severity slider, headline impact, top hits with paths, propagation graph, evidence drawer, Not modeled list.
9. Ask panel: chat with suggestion chips.

Top bar on every page: portfolio value, Practice badge when applicable, level switcher.

---

## 8. Security Considerations

- Gemini, Finnhub, Alpha Vantage keys, `FINNHUB_WEBHOOK_SECRET` and the Supabase service role key live only in Railway env vars. Never in the frontend, never in `NEXT_PUBLIC_*` variables, never pasted in chat or committed. `.env` in `.gitignore` before the first commit; `.env.example` lists names only.
- Finnhub webhook requests are rejected unless the `X-Finnhub-Secret` header matches.
- Screenshots are processed in memory and never stored. Prompt instructs Gemini to ignore account numbers and personal info; backend strips any field outside the schema.
- CSV accepts only ticker, shares, cost basis.
- RLS enabled on all user-owned tables before the demo.
- CORS on the Node API restricted to the Vercel domain.
- Rate limit `/snap`, `/ic`, `/ask` per user (e.g. 20/hour) to protect Gemini quota during judging.
- No buy/sell language anywhere; "Educational tool, not investment advice" on IC Room and Ask.

---

## 9. Development Phases and Milestones

**Clock deadlines (work backward from the 10:59 AM git lock):**

| Time | Milestone | Owner |
|---|---|---|
| Kickoff + 1.5h | Contract agreed, scaffolds deployed (Vercel + Railway), Supabase schema live, Gemini keys working | All |
| 9:00 PM Sept 26 | Every P0 endpoint returns real data for the demo portfolio | Backend |
| 1:00 AM Sept 27 | **Cut checkpoint:** all P0 pages on live API. If any P0 is broken, cut in the order listed under Rule below and swarm it | All |
| 5:00 AM | Demo outputs pre-computed and cached; demo script run end to end once | All |
| 7:00 AM | **Feature freeze.** Bug fixes and copy only | All |
| 9:00 AM | Devpost draft done (text, Gemini section, screenshots) | BE2 |
| 9:30 AM | Backup demo video recorded from production URL | BE1 |
| 10:30 AM | **Final commit target.** Confirm Vercel production deploy is from this commit | Gui |
| 10:59 AM | Git lock. No commits after this | - |
| 11:00 AM | Devpost submitted (aim for 10:45 AM) | BE3 |

**Frontend backup:** BE1's lane finishes earliest (X-Ray + Snap). From hour 10 BE1 moves to frontend and owns the Radar and Shock Test pages. Gui keeps Onboarding, Import, X-Ray and IC Room.

Phase breakdown (hours from kickoff):

| Phase | Hours | Gui (Frontend) | BE1: Data + X-Ray + Import | BE2: Radar + Shock Test | BE3: IC Room + Ask + Infra |
|---|---|---|---|---|---|
| 0. Setup | 0 to 1.5 | Next.js + Tailwind + shadcn scaffold, layout, mock JSON from contract, deploy to Vercel | Supabase schema, seed `securities` from SEC tickers | EDGAR client (User-Agent, throttle), XBRL facts client, FRED client | FastAPI skeleton on Railway, JWT verify, Gemini keys + backoff helper, Finnhub endpoint test |
| 1. Seed | 1.5 to 4 | Onboarding level picker + Practice builder + Import page on mocks | Seed ~20 ETFs (incl. SCHD), Finnhub prices/profiles, `/portfolio/*` incl. practice templates, `PATCH /profile` | Section extraction for 5 demo tickers; curated shock universe + edges (Gemini evidence extraction) into Postgres and NetworkX | Fact pack builder (XBRL + grounded news + Finnhub metrics) |
| 2. Core | 4 to 10 | X-Ray page + IC Room page on mocks | `/xray` algorithm + `/portfolio/snap` with Gemini vision + performance series | Radar diff prompt + `/radar`; `/shock/run` with portfolio mapping | Bull/Bear/Chair prompts + level style blocks, `/ic` SSE, level rewrite pass |
| 3. Integrate | 10 to 14 | Swap mocks for live API, streaming UI, performance chart | Frontend: Radar page + Shock Test page (Cytoscape); tune demo portfolio for the CRE story | Pre-compute demo Radar cards and CRE/oil shock runs; free-text shock parsing on Flash | `/ask` SSE, rate limits, demo account, Google auth |
| 4. Polish | 14 to 18 | Visual polish, source drawers, loading narration, responsive pass | Test Snap Import on 3 real screenshots | Quality check every demo card and shock path; glossary JSON (~40 terms) | P2 Listen mode or webhooks only if all P0/P1 done |
| 5. Freeze | 18+ | **Feature freeze.** Final deploy | Record backup demo video | Devpost write-up (include Gemini section 4) | Rehearse pitch 3 times |

**Rule:** if a P0 is not working at the 1:00 AM checkpoint, cut in this order until it is: Listen mode, webhooks, Ask, Google auth (demo account only), Shock Test graph view (keep headline + top hits list), free-text shocks (keep packs).

**Git hygiene for the lock:** work on short-lived branches, merge to `main` often; after 7:00 AM only Gui merges to `main`. Anything not merged by 10:30 AM does not ship.

**Demo script (under 3 minutes):**
Demo portfolio must include CRE-sensitive names covered by the shock universe so step 4 shows a real hit.

1. (15s) Problem: "Investors own more than they think and read less than they should."
2. (25s) Snap Import: drop a brokerage screenshot, holdings appear. (Gemini vision)
3. (25s) X-Ray: hidden NVDA concentration across VOO, QQQ and a direct position.
4. (35s) Shock Test: "commercial real estate falls 20%". Headline impact, drag the slider, follow one path to its SEC evidence. "Blackstone underwrites this risk every day; now anyone can see it."
5. (20s) Radar: open a high-severity card and its real SEC excerpt.
6. (35s) IC Room on a ticker the user does not own: bull and bear debate with cited news; memo shows how buying changes concentration.
7. (10s) Flip the level switcher from Advanced to Beginner: same numbers, plain-language rewrite.
8. (10s) Close: every number deterministic, every claim sourced, Blackstone-style diligence for everyone from first-timers to analysts.

---

## 10. Potential Challenges and Solutions

| Challenge | Solution |
|---|---|
| Final build day, limited hours | Mock-first frontend against the API contract; hard feature freeze at hour 18. |
| Gemini free tier 429s | One AI Studio project per dev, keys split by feature, backoff, cache-first demo. |
| Grounding or TTS unavailable on free tier | Finnhub news fallback; Web Speech API fallback. |
| Snap Import misreads screenshots | Editable preview table before saving; tested screenshots in demo. |
| Alpha Vantage rate limit | Seed ETF constituents once at kickoff. |
| Finnhub free limit (~60/min) or premium-only endpoints | Test all endpoints in the first 15 minutes; token bucket + Postgres cache; Gemini grounding for news, Alpha Vantage for candles as fallbacks. |
| SEC blocks requests | Proper `User-Agent` with contact email, under 10 req/s. |
| 10-Q "no material changes" | Diff MD&A too; prefer 10-K pairs for demo. |
| AI hallucination | Fact ids, server-side drop of uncited points, source drawers in UI. |
| Serverless timeouts on long AI jobs | Long jobs run on the Railway FastAPI service, not Vercel functions. |
| Shock Test coverage limited to the curated universe | "Not modeled" list; demo portfolio chosen from covered tickers. |
| Shock parsing weaker on Flash than Pro | Strict Pydantic schema, enum of supported drivers, scenario packs as the default path. |
| Shock engine takes longer than expected | Build CRE pack end to end first, oil second; packs pre-computed so the demo works even if live runs lag. |
| Venue Wi-Fi fails | Backup demo video; demo data pre-cached. |
| "Is this investment advice?" | No buy/sell stance, educational framing, sources on everything. |

---

## 11. Future Expansion

- **Brokerage linking** via Plaid Investments, SnapTrade, or a read-only Robinhood Agentic Trading MCP connection (positions import only).
- **Private Markets Decoder:** look-through for non-traded REITs, private credit and interval funds (NAV vs public comps, redemption limits, fees). Strong fit for Blackstone.
- **More Shock Test packs** (rate spike, recession, private credit stress).
- **Email alerts** when a holding files a new 10-K/10-Q/8-K with high-severity changes.
- **Earnings call digests** and management tone shifts quarter over quarter.
- **Watchlists** with automatic weekly IC memos.
- **Native iOS app** reusing the same API.
