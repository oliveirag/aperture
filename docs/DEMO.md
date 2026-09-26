# Lookthrough demo runbook

Three minutes, one path, no network needed once the tab is loaded.

## 1. Setup checklist

Do this 15 minutes before judging.

- [ ] Production URL open in a **clean Chrome profile** (no extensions, no bookmarks bar).
- [ ] Zoom at **100%** (Cmd+0).
- [ ] Window at **1440×900** (or 1280×720 on a projector).
- [ ] Level set to **Intermediate** (press `Alt+R` to reset everything).
- [ ] `public/demo/brokerage-positions.png` copied to the **desktop**, Finder window placed so you can drag it into Chrome.
- [ ] Backup video open in a second tab.
- [ ] Load every page once (`Alt+1` to `Alt+4`) so they're warm in the tab, then `Alt+R` back to the landing page.
- [ ] Notifications off (Do Not Disturb), laptop plugged in.

## 2. The 3-minute script

| Time | Screen | Do | Say |
| --- | --- | --- | --- |
| 0:00–0:15 | `/` | Point at the headline, click **Try the demo**. | "Brokerages show you what you bought. We show you what's inside it." |
| 0:15–0:22 | `/onboarding` | Pick **Advanced**, continue. | "Every screen adapts to how much finance you know." |
| 0:22–0:40 | `/import` | Drag `brokerage-positions.png` from the desktop onto the drop zone (Gemini reads it live, usually 5–15 s). Wait for the rows, click **Look through my portfolio**. Short on time or no network: click **Use sample screenshot** instead (2.4 s). | "A screenshot is all it takes. Gemini reads seven positions, Finnhub prices them live." |
| 0:40–1:10 | `/xray` | Let the map reveal. Hover **NVIDIA**. Point at the flags strip. | "NVIDIA isn't one position. It's three, and 17.6% of your money: 13.3% direct, 2.2% through VOO, 2.1% through QQQ." |
| 1:10–1:50 | `/shock` | Click the **Commercial real estate decline** card. Watch propagation. Drag the slider to **30%** (−6.1%). Click the **BXP** row, then **Evidence** (BXP 10-K). | "A 20% CRE decline moves you about −4.1%, −$6,028. Every link is backed by a filing." |
| 1:50–2:10 | `/radar` | On the **NVIDIA** card, click **Compare wording**. | "Four filings, ranked by how much of your money they touch. Here's exactly what changed." |
| 2:10–2:45 | `/ic` | Click **Run pre-mortem** (use **Skip to memo** if short on time). Point at portfolio fit **31.2% → 35.5%**. | "Before you buy AMD, the committee checks the thesis and what it does to your portfolio." |
| 2:45–2:55 | `/ic` | Flip the level switch **Advanced → Beginner** on the memo. | "Same memo, rewritten for someone who just started." |
| 2:55–3:00 | `/ic` | Stop. | "Lookthrough. See what you actually own." |

## 3. Fallbacks and shortcuts

Deep links (type in the address bar):

- `/shock?scenario=cre` starts the CRE shock on load.
- `/ic?run=1` starts the committee on load.
- `/demo-assets/brokerage` shows the sample brokerage screen if the PNG is missing (screenshot it with Cmd+Shift+4).

Presenter shortcuts (ignored while typing in a field):

| Keys | Action |
| --- | --- |
| `Alt+1` | X-Ray |
| `Alt+2` | Shock Test |
| `Alt+3` | Filing Radar |
| `Alt+4` | IC Room |
| `Alt+L` | Cycle level: Beginner → Intermediate → Advanced |
| `Alt+R` | Reset demo state (shock cleared, level Intermediate) and go to `/` |

If the drag-drop misses, click **Use sample screenshot** on `/import`; it replays the demo portfolio. If Gemini is overloaded the panel shows **Try again** and **Use sample instead**; pick the sample. To import a real portfolio without Gemini, switch to **CSV file** (Fidelity, Schwab or Vanguard export) or **Type it in**; both are priced by Finnhub only. Dropping the demo PNG keeps the demo portfolio; any other screenshot becomes an imported portfolio for the session (the top bar says **Imported portfolio**, and X-Ray offers **Switch to demo**).

## 4. Failure plan

- **Wi-Fi drops:** keep going. Live prices fall back to the Sep 25 snapshot and screenshot import needs the network (use the sample). Every page already loaded in the tab keeps working, including client-side navigation between pages. Don't hard-refresh while offline.
- **A page shows "Something went sideways.":** click **Reload this page**. If it repeats, use `Alt+1` to `Alt+4` or a deep link to skip to the next step.
- **Tab crashes or freezes:** switch to the backup video tab and narrate over it from the same timestamp.
- **Projector cuts the edges:** switch the window to 1280×720; every page is checked at that size.

## 5. Honest talking points

- **What's live:** the interface, the look-through math, the shock propagation, and level rewrites all run in the browser from one curated demo dataset. The numbers are internally consistent (checked by `scripts/check-canon.ts`).
- **What's pre-computed:** holdings look-through, filing excerpts and diffs, shock paths, and the IC committee run are prepared ahead of time for seven real tickers (VOO, QQQ, NVDA, KRE, AAPL, BXP, MSFT) and AMD. The committee run is scripted, not generated live.
- **Gemini's role:** any screenshot dropped on `/import` is read live by Gemini vision with structured output (`/api/snap`), racing several Flash models so one overloaded model doesn't stall the read. Every position is then priced live by Finnhub. Needs `GEMINI_API_KEY` and `FINNHUB_API_KEY` on the deploy. **Use sample screenshot** replays the demo portfolio without Gemini.
- **Beginner path:** picking **Beginner** asks "Do you own any investments yet?"; **Not yet** opens `/practice`, where a starter template (or your own tickers) and a pretend amount are priced live into fractional shares and get the same real X-Ray, labeled "Practice · no real money" everywhere.
- **What's live vs. curated:** portfolio value, holding prices, logos and industries are live (Finnhub). For an imported portfolio the whole X-Ray is computed from real data: live prices, Finnhub industries and published ETF holdings (Alpha Vantage; 20 popular ETFs are seeded in `src/data/etf-seed.json`, others are fetched live with `ALPHA_VANTAGE_API_KEY`). The demo portfolio keeps its curated X-Ray so the story matches the other pages. Filing Radar is real for imported and practice portfolios too: it compares Item 1A of each company's two latest 10-Ks from SEC EDGAR (needs `SEC_USER_AGENT` with a contact email), a deterministic diff decides what changed, and Gemini only labels and quotes it (every quote is checked verbatim against the filing). Shock Test and the IC Room portfolio fit are curated for the demo portfolio only and say so when another portfolio is active.
- **Not investment advice.** This is an educational tool; the footer says so on every page.
