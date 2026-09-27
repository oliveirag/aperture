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
- **X-Ray:** deterministic company exposure and ETF overlap calculations. The demo portfolio and imported ones alike use live quotes and dated fund holdings; the demo's September 25 snapshot is only a labeled fallback. Beginner shows three top exposures, Intermediate adds holdings/sectors and the top ten, Advanced adds contribution columns and performance.
- **Shock Test:** `/shock` is the primary graph, `/shock/flow` is optional detail, and `/shock/graph` redirects to the canonical page. CRE and AI spending packs use illustrative sensitivities. Custom scenarios support one explicit oil-price, import-cost, US-dollar or chip-supply change, including Hormuz closure and an explicitly assumed tariff decrease. Event questions can only be mapped to a driver when cited research establishes a mechanism; elections alone, combined drivers and percentage-point changes are rejected. Gemini grounding supplies cited mechanism summaries when available; otherwise known scenarios use clearly labeled EIA/USITC references. References do not establish current events or future stock returns. Assumptions and deterministic math remain separate from evidence. Unknown exposure is not zero risk.
- **Filing Radar:** SEC retrieval and quote verification for every portfolio, the demo included. Provider errors remain visible. Beginner omits low-severity cards; Intermediate opens one comparison; Advanced opens all comparisons.
- **IC Room:** investment committee research with source facts, bull/bear arguments and portfolio fit. Every run uses live collection; there is no scripted replay. Citations remain available at every level; Beginner shows fewer points, Advanced adds an evidence audit.

No model-based stock-prediction feature ships in this release. Advanced X-Ray can show an empirical historical range when a holding has enough weekly history; it is explicitly not a price target or forecast. Scenario coefficients are assumptions, not forecasts. Gemini is optional: when every key is out of quota, screenshot import uses local OCR, Filing Radar compares filings sentence by sentence, Shock Test cites the holdings' own 10-K passages, IC Room runs a labeled rules-based committee, and Ask answers from portfolio data. None of these fallbacks is presented as AI research. See [demo runbook](docs/DEMO.md#fallbacks).

Before a demo, run `npm run warm` against the running server; see the [runbook](docs/DEMO.md).

## Verification

```sh
npm run test:release
npx next typegen
npx tsc --noEmit
npm run lint
npm run build
```

The release test covers scenario parsing/refusal, deterministic signs and math, sector residuals, graph integrity, finite inputs, and CSV/XLS/XLSX worksheet parsing. Additional deterministic checks live in `scripts/check-*.ts` and run with `node --import tsx`.

See [demo runbook](docs/DEMO.md), [verification notes](docs/VERIFICATION.md), and the [historical PRD](docs/PRD.md).
