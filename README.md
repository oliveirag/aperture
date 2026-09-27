# Aperture

Portfolio X-Ray, explainable stress tests, Filing Radar and an investment committee research workflow. Built with Next.js 16 App Router, React 19, TypeScript and Tailwind. Server endpoints live in `src/app/api`; this release does not require a separate FastAPI service.

## Run locally

```sh
npm ci
# Copy .env.example to .env.local and configure providers locally.
npm run dev
```

Never commit `.env.local`. Finnhub supplies quotes and company profiles; Gemini supplies screenshot extraction, grounded research and committee narratives. SEC EDGAR supplies filing text. Published ETF holdings come from the dated seed in `src/data/etf-seed.json` or Alpha Vantage. Saved imports at `/import/history` use the existing authenticated Supabase workflow; see [setup](supabase/README.md). The quick import at `/import` does not require an account.

## What the app actually does

- **Import:** screenshot extraction through Gemini, typed positions, and local CSV/XLSX/XLS parsing. Excel users explicitly choose a worksheet. Only position fields are sent for pricing; spreadsheet files stay on the device. Review is required before X-Ray. Missing valuations block continuation; unavailable live quotes may use labeled supplied values. Cash and unsupported rows are listed as skipped.
- **X-Ray:** deterministic company exposure and ETF overlap calculations. The demo uses a curated snapshot; imported portfolios use provider data and dated fund holdings. Every company and every fund path is in the model; funds with partial holdings coverage are flagged at every level.
- **Shock Test:** `/shock` is the primary graph, `/shock/flow` is optional detail, and `/shock/graph` redirects to the canonical page. CRE and AI spending packs use illustrative sensitivities. Custom scenarios support one explicit oil-price, import-cost, US-dollar or chip-supply change, including Hormuz closure and an explicitly assumed tariff decrease. Event questions can only be mapped to a driver when cited research establishes a mechanism; elections alone, combined drivers and percentage-point changes are rejected. Gemini grounding supplies cited mechanism summaries when available; otherwise known scenarios use clearly labeled EIA/USITC references. References do not establish current events or future stock returns. Assumptions and deterministic math remain separate from evidence. Unknown exposure is not zero risk.
- **Filing Radar:** SEC retrieval and quote verification for live comparisons. Provider errors remain visible. The demo portfolio offers a separately labeled illustrative feed with a replay button; it is not a live filing comparison. Coverage counts every filing reviewed, and companies beyond the ten Radar reads are listed.
- **IC Room:** investment committee research with source facts, bull/bear arguments and portfolio fit. New runs use live collection and never substitute an AMD memo. Only **Replay labeled AMD example** starts the illustrative replay. The chair's summaries for each level must state the same cited material claims and use only figures from the facts or fit table; a summary that fails is replaced by one built from the claims.

## Experience levels

Beginner, Intermediate and Advanced set how much detail starts open; they never change inputs, calculations, rankings or sources, and nothing is removed. Collapsed items always show a count and a "Show" control, and every section has "What does this mean?" and "Show calculation". The rules live in one typed policy (`src/lib/experience/policy.ts`) with pure view selectors per feature.

- **Beginner** (understand what I own): personal headline, three exposures, definitions inline, explanations open, lower-severity filing changes folded behind a counted row, two bull and two bear points plus "Show more".
- **Intermediate** (connect and investigate): top ten, sectors, a fund-comparison table, "since your last visit" for X-Ray and Radar (stored on this device), a research checklist in the IC Room.
- **Advanced** (inspect and operate): every exposure with a column per fund, calculations and assumption tables open, scenario comparison, IC evidence audit and run record (models used, run id), two-decimal precision.

The material set (value and valuation time, concentration flags, coverage gaps, high-severity changes, assumption labels, errors, demo/practice labels) is shown at every level. The level is kept on the device (`localStorage`) and, when signed in, on the profile; the most recent explicit choice wins (apply `supabase/migrations/20260927000000_experience.sql`). Ask conversations, IC memos and scenario results are cleared when the account or portfolio changes.

No model-based stock-prediction feature ships in this release. Advanced X-Ray can show an empirical historical range when a holding has enough weekly history; it is explicitly not a price target or forecast. Scenario coefficients are assumptions, not forecasts. Live Gemini features require available quota; a quota failure is not a successful AI research run.

## Verification

```sh
npm run test:release
npm run test:experience
npx next typegen
npx tsc --noEmit
npm run lint
npm run build
```

The release test covers scenario parsing/refusal, deterministic signs and math, sector residuals, graph integrity, finite inputs, and CSV/XLS/XLSX worksheet parsing. Additional deterministic checks live in `scripts/check-*.ts` and run with `node --import tsx`.

See [demo runbook](docs/DEMO.md), [verification notes](docs/VERIFICATION.md), and the [historical PRD](docs/PRD.md).
