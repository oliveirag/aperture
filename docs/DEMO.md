# Aperture demo runbook

Use a 1440×900 or 1280×720 browser at 100% zoom. Start at `/` and select Intermediate. Live provider calls require network access and working quota; warming pages does not make live research work offline.

1. Open `/import`, choose **Type it in**, enter AAPL 10 and VOO 5, then price. Check the returned status and review every row. Tick the review checkbox and open X-Ray. CSV/Excel uses the same review step; workbooks with multiple visible sheets require a selection.
2. Inspect direct Apple plus VOO exposure. Switch to the demo portfolio to show the curated NVIDIA overlap through direct NVDA, QQQ and VOO. Describe those figures as a dated demo snapshot.
3. Open `/shock`: the graph is the primary view. Run CRE and AI spending, adjust severity and inspect a node. Sources explain relationships; the equity-return coefficients are illustrative stress assumptions.
4. Ask **What if Iran closes the Strait of Hormuz?** Inspect the reference/web label, source links, assumed oil-price magnitude, calculated effect and unknown holdings. When Gemini is unavailable, say explicitly that the EIA mechanism reference is being used without live web research. **What if Democrats win and tariffs go down?** models the tariff decrease the user stated. **What if Democrats win the election?** with working Gemini research proposes a driver only when cited sources describe the mechanism, labels it an assumption with its rationale and default size, and refuses when sources do not; without live research it refuses. Also try **Taiwan chip supply drops 30%** and **the dollar strengthens 10%**: with or without web research, the evidence includes verbatim risk-factor passages from the holdings' latest 10-Ks (NVIDIA on Taiwan supply, Apple on dollar strength), linked to EDGAR. On Advanced X-Ray, open Historical range and read the backtest coverage line.
5. Open Radar. Imported portfolios retrieve SEC filings; quote verification precedes display. If providers fail, show the error rather than describing an example as live. On the demo portfolio, **View labeled example feed** opens the illustrative vertical feed. Inspect a source drawer and its labeling.
6. Open IC Room. IC means investment committee. A new ticker/thesis invokes live research; unavailable providers show failure. **Replay labeled AMD example** is the only scripted replay path and is explicitly illustrative. Inspect citations; Advanced adds an evidence audit.
7. Switch levels: X-Ray changes row count and breakdowns; Shock changes graph node visibility and assumption tables; Radar changes low-severity inclusion and comparison expansion; IC changes point count and evidence detail.

## Fallbacks

Gemini is optional for every page. When every configured key is out of quota (or a call fails), each feature switches to a labeled non-model path built from the same real data:

- **Screenshot import:** local OCR (Tesseract) reads the image; rows are labeled "Read by text recognition" and still need review. **Use sample screenshot** replays deterministic demo holdings and is not proof of extraction.
- **Filing Radar:** a sentence-by-sentence comparison of the two filings' risk sections, grouped under the filing's own headings. Every quote is verbatim from EDGAR and passes the same verification.
- **Shock Test:** evidence comes from the EIA/USITC references and the holdings' own 10-K passages ("filing" mode). Election-only questions still refuse without cited web research.
- **IC Room:** a rules-based committee computes cited bull/bear points, assumptions and a memo from XBRL fundamentals, Finnhub data, Radar and portfolio fit. The memo says it is rules-based and does not judge the thesis wording.
- **Ask:** answers company, exposure, sector, overlap, filing, memo and glossary questions from the portfolio data and says the AI assistant was unavailable.
- CSV, XLSX, XLS and typed inputs never need Gemini; quotes need Finnhub unless supplied values are available and labeled.
- Every successful provider result is kept as a last known good copy (memory and `.next/cache/aperture`). If SEC or Finnhub fails mid-demo, that copy is served. Before presenting, click through each page once to warm it.
- Put several Gemini keys in `GEMINI_API_KEYS` (comma-separated) for failover between keys.
- `/shock?scenario=cre` and `/shock?scenario=ai-capex` select prepared scenarios. `/ic?run=1` no longer auto-starts a replay.
- Presenter shortcuts: Alt+1 X-Ray, Alt+2 Shock, Alt+3 Radar, Alt+4 IC, Alt+L level, Alt+R reset demo.

Never call sample wording a verified filing quotation or claim every graph coefficient was measured from a filing. Educational tool, not investment advice.
