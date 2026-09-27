# Aperture demo runbook

Use a 1440×900 or 1280×720 browser at 100% zoom. Start at `/` and select Intermediate.

**Before presenting:** start the server, then run `npm run warm`. It calls every provider the demo uses and must end with "All steps warm". Results are kept in `.next/cache/aperture`, so a restart or a provider outage during the demo serves the warmed copy. Don't delete `.next` after warming.

1. Open `/import` and click **Use sample screenshot**: the image is really read (Gemini, or text recognition when Gemini is unavailable) and every position is priced by Finnhub. Or choose **Type it in**, enter AAPL 10 and VOO 5, then price. Check the returned status and review every row. Tick the review checkbox and open X-Ray. CSV/Excel uses the same review step; workbooks with multiple visible sheets require a selection.
2. Inspect direct Apple plus VOO exposure. Switch to the demo portfolio to show the NVIDIA overlap through direct NVDA, QQQ and VOO. The demo portfolio is computed like any import: live quotes and published ETF holdings, so the figures move with the market.
3. Open `/shock`: the graph is the primary view. Run CRE and AI spending, adjust severity and inspect a node. Every filing quote in these scenarios is verbatim from the company's 10-K on EDGAR (BXP, Zions, NVIDIA, Microsoft) and labeled "Quote"; the equity-return coefficients are illustrative stress assumptions.
4. Ask **What if Iran closes the Strait of Hormuz?** Inspect the reference/web label, source links, assumed oil-price magnitude, calculated effect and unknown holdings. When Gemini is unavailable, say explicitly that the EIA mechanism reference is being used without live web research. **What if Democrats win and tariffs go down?** models the tariff decrease the user stated. **What if Democrats win the election?** with working Gemini research proposes a driver only when cited sources describe the mechanism, labels it an assumption with its rationale and default size, and refuses when sources do not; without live research it refuses. Also try **Taiwan chip supply drops 30%** and **the dollar strengthens 10%**: with or without web research, the evidence includes verbatim risk-factor passages from the holdings' latest 10-Ks (NVIDIA on Taiwan supply, Apple on dollar strength), linked to EDGAR. On Advanced X-Ray, open Historical range and read the backtest coverage line.
5. Open Radar. Every portfolio, the demo included, compares each company's latest 10-K or 10-Q with the prior one; quote verification precedes display. Inspect a source drawer: filing passages are labeled verbatim.
6. Open IC Room. IC means investment committee. Every run is live research on the chosen ticker; without Gemini the memo is rules-based and says so. Inspect citations; Advanced adds an evidence audit.
7. Switch levels: the numbers never change; what starts open does. X-Ray: three rows (Beginner) → top ten, sectors and fund comparison (Intermediate) → every company with a column per fund and calculations open (Advanced). Shock: filters and assumption tables start off or on; Advanced opens the scenario comparison. Radar: Beginner folds low-severity changes behind a counted "lower-severity change · Show" row, and the coverage count still includes them. IC: two points plus "Show more" (Beginner), research checklist (Intermediate), evidence audit and run record (Advanced). Every collapsed item stays one click away.

## Fallbacks

Gemini is optional for every page. When every configured key is out of quota (or a call fails), each feature switches to a labeled non-model path built from the same real data:

- **Screenshot import:** local OCR (Tesseract) reads the image; rows are labeled "Read by text recognition" and still need review. **Use sample screenshot** goes through the same reader.
- **Filing Radar:** a sentence-by-sentence comparison of the two filings' risk sections, grouped under the filing's own headings. Every quote is verbatim from EDGAR and passes the same verification.
- **Shock Test:** evidence comes from the EIA/USITC references and the holdings' own 10-K passages ("filing" mode). Election-only questions still refuse without cited web research.
- **IC Room:** a rules-based committee computes cited bull/bear points, assumptions and a memo from XBRL fundamentals, Finnhub data, Radar and portfolio fit. The memo says it is rules-based and does not judge the thesis wording.
- **Ask:** answers company, exposure, sector, overlap, filing, memo and glossary questions from the portfolio data and says the AI assistant was unavailable.
- CSV, XLSX, XLS and typed inputs never need Gemini; quotes need Finnhub unless supplied values are available and labeled.
- Every successful provider result is kept as a last known good copy (memory and `.next/cache/aperture`). If SEC or Finnhub fails mid-demo, that copy is served. `npm run warm` fills it.
- If live quotes are unavailable and nothing is cached, the demo portfolio falls back to its September 25 snapshot and says so.
- Accounts and saved imports stay off until `supabase/migrations` are applied and `NEXT_PUBLIC_ACCOUNTS=1` is set.
- Put several Gemini keys in `GEMINI_API_KEYS` (comma-separated) for failover between keys.
- `/shock?scenario=cre` and `/shock?scenario=ai-capex` select prepared scenarios. `/ic?run=1` no longer auto-starts a replay.
- Presenter shortcuts (demo portfolio only): Alt+1 X-Ray, Alt+2 Shock, Alt+3 Radar, Alt+4 IC, Alt+L level, Alt+R reset demo.

Never call sample wording a verified filing quotation or claim every graph coefficient was measured from a filing. Educational tool, not investment advice.
