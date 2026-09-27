# Aperture implementation handoff

Use this file to continue the current implementation in a new chat. The goal is to finish the changes below, verify the app in the browser, and open a PR from the completed work.

## Repository state

- Repo: `/Users/zakariakhan/Documents/lookthru`
- Branch: `feat/aperture-release`
- PR #55 is the active delivery branch. It has been merged locally with `origin/main` to resolve the three GitHub conflicts in the import and landing files.
- The worktree is intentionally dirty with the in-progress Aperture changes. Do not reset, discard, or overwrite them.
- Existing user file to preserve: `.claude/launch.json`
- `.env.local` is ignored and must never be committed. It contains local provider configuration supplied by the user. Never print or copy its values.
- The checked-out branch includes the teammate import and graph work from `origin/main`.

## User-approved product direction

The Blackstone judges explicitly liked:

- X-Ray and its double-counting explanation, especially NVIDIA through QQQ and VOO.
- The Shock graph with visible propagation links and hops.
- Filing Radar's vertical news-feed presentation with the source filing behind each item.
- IC Room's thesis workflow with bull case, bear case, portfolio fit, and research.
- The existing Aperture visual theme.

Keep those surfaces recognizable. Reduce unexplained jargon and bloat around them.

The product must:

- Be called Aperture everywhere user-facing and in project identifiers where safe.
- Avoid unsupported claims and hallucinated source text.
- Clearly separate retrieved facts, source summaries, assumptions, and portfolio calculations.
- Keep the graph in the primary Shock Test experience.
- Make Beginner, Intermediate, and Advanced materially different in data and workflow depth.
- Let a user ask scenario questions such as:
  - `What if Iran closes the Strait of Hormuz?`
  - `What if Democrats win the election and tariffs go down?`
- Refuse to infer an election result into a policy change without an explicit assumption.
- Support screenshot, CSV, XLSX, and XLS portfolio imports.
- Prove the import-to-X-Ray path in a browser with real or explicitly labeled deterministic data.

## Work already implemented in this worktree

### Aperture rename

A broad rename has been applied across UI, metadata, docs, package name, persisted portfolio key, SEC user-agent default, API naming, and source filenames. Review all remaining occurrences before the PR, including deleted-file paths, route names, package-lock metadata, generated `.next` files, git remote naming, and any hidden documentation.

Notable changes include:

- The legacy portfolio API path was renamed to `/api/aperture`.
- Aperture wordmark and metadata.
- `aperture-portfolio` session storage key.
- Aperture names for the X-Ray map and landing illustration files.

Do not rewrite git history or rename the remote repository unless explicitly requested.

### Shock scenario research

Added:

- `src/app/api/shock/research/route.ts`
- `src/lib/shock/research-model.ts`
- `src/features/shock/research-store.ts`
- `src/features/shock/research-evidence.tsx`

The endpoint:

1. Parses an explicit supported driver.
2. Uses Gemini Google Search grounding when Gemini is available.
3. Falls back to a labeled reference source for known oil or import-cost scenarios when Gemini quota is unavailable.
4. Builds a deterministic scenario sensitivity table.
5. Maps that table through the same look-through portfolio model.
6. Returns evidence, assumptions, sensitivities, modeled holdings, unmodeled holdings, and the calculated result.

The current fixed drivers are oil price, import costs, US dollar and chip supply. The current reference sources are EIA for Hormuz and USITC for tariffs. These sources explain mechanisms only. They do not prove future equity returns.

The Shock graph now accepts a researched scenario and the main `/shock` page uses the graph view. The old step-by-step view is at `/shock/flow`.

Ask detects scenario questions and routes them to the same research store, with a link back to the scenario graph.

### Imports

The default `/import` page was restored to the styled quick flow. The heavier authenticated saved-import workspace is canonical at `/import/history`.

Added local spreadsheet parsing in `src/features/import/spreadsheet.ts` using SheetJS. CSV, XLSX, and XLS are accepted. Multiple worksheets are shown for explicit user selection rather than silently combining accounts. Users must review rows before opening X-Ray.

The default import page now says screenshots are sent to Gemini and spreadsheet files stay on the device. Do not claim that every input is live-priced unless the row status proves it.

### Evidence labeling

Source drawers and graph notes now distinguish:

- Verified filing passages.
- Source summaries or calculated market/ETF data.
- Illustrative demo summaries that are not verbatim filing quotes.
- Stress-test coefficients that are assumptions.

Live Radar no-material-change states now avoid claiming that filings are identical. Demo Radar recheck is labeled as an example replay and does not imply a live request.

### Levels

Partial level differentiation is implemented:

- Beginner X-Ray shows the top three exposures and fewer breakdown cards.
- Advanced X-Ray shows the full details and performance view.
- Beginner Shock hides context and source nodes and keeps the main explanation simpler.
- Advanced scenario evidence exposes the calculation and modeled holding table.
- IC always shows citations, beginner shows fewer bull/bear points, and advanced exposes an evidence audit.

This needs browser verification. Ensure the levels change logic and visible data, not only sentences.

### Landing and branding cleanup

- Removed the repeated landing marquee.
- Replaced the animated landing percentage with a stable value to avoid an initial `0.0%` flash.
- Reworded the vague “Seen through, not around” heading.

## Live verification evidence

The local app was running on `http://localhost:3000` during the previous session.

Finnhub works with the supplied local configuration. A direct request returned a current AAPL quote:

```json
{"price":341.07,"change":5.15,"changePct":0.015331,"prevClose":335.92}
```

Browser verification on `/import` succeeded for `AAPL` and `VOO`:

- AAPL: 10 shares, `$3,411`, Matched.
- VOO: 5 shares, `$3,554`, Matched.
- Total: `$6,965`, 2 of 2 matched.
- The review checkbox enabled “Look through my portfolio.”

Gemini authentication works, but generation currently returns HTTP 429 because the supplied key has exhausted quota. A direct stable-model probe also confirmed the key is accepted while that model is unavailable to new users. Do not claim live web research passed until a working Gemini key/quota is available.

## Required follow-up before opening the PR

1. Read this file and inspect the complete diff. Preserve user changes.
2. Fix all TypeScript and lint issues. At the last check, `npx tsc --noEmit` and `npm run lint` completed without output after the latest fixes, but rerun them after every change.
3. Run `npx next typegen` before the final typecheck.
4. Make the test script runnable. `scripts/check-aperture-release.ts` was added to cover:
   - oil scenario parsing
   - unsupported election-only questions
   - combined-driver refusal
   - percent-point refusal
   - deterministic math and sign reversal
   - sector residual exposure without double counting
   - graph link integrity
   - finite input validation
   - CSV/XLSX/XLS parsing and worksheet selection

   The sandboxed `npx tsx` runner previously failed while creating its IPC socket. If necessary, use an approved local test invocation or adjust the runner configuration. Do not silently mark this test passed without actually running it.

5. Verify the primary `/shock` page in the browser:
   - graph is visible without opening a secondary Graph tab;
   - CRE and AI scenarios still work;
   - custom Hormuz query produces the reference-only fallback while Gemini is quota-blocked;
   - evidence and assumptions are visible;
   - source links open the cited EIA/USITC pages;
   - severity changes recalculate the portfolio effect;
   - unmodeled holdings are explicitly shown as unknown exposure.
6. Confirm the old `/shock/graph` route redirects to the canonical `/shock` surface. `/shock/flow` is optional secondary detail.
7. Verify the Graph implementation does not render dangling links for researched sector-residual nodes. Check that source nodes and company nodes have readable labels at the demo viewport.
8. Verify Beginner, Intermediate, and Advanced in X-Ray, Shock, Radar, and IC. Capture what actually changes in each mode and remove any remaining sentence-only differences.
9. Verify IC Room:
   - plain-language explanation of “IC” is visible;
   - the default AMD replay is explicitly labeled illustrative;
   - clicking “Replay labeled AMD example” is the only path that uses the scripted replay;
   - a new ticker/thesis uses live source collection and never silently falls back to the AMD memo;
   - every generated point has a valid fact reference.
10. Verify Filing Radar:
    - demo feed is clearly labeled illustrative;
    - imported portfolio uses SEC filing retrieval and quote verification;
    - no-material-change states do not overclaim;
    - the vertical feed and source drawer remain intact.
11. Verify imports:
    - typed AAPL/VOO;
    - CSV;
    - XLSX with two worksheets and explicit selection;
    - XLS/Biff8;
    - screenshot path when Gemini is available;
    - incomplete or unpriced rows cannot silently produce an understated X-Ray.
12. Run a repository-wide branding search. No legacy product-name references should remain in user-facing copy or source identifiers. Do not commit `.env.local`.
13. Keep README and `docs/DEMO.md` aligned with the actual architecture and truthfully distinguish live, curated, reference-only, and illustrative data.
14. Keep the historical-range stretch explicitly empirical and non-predictive. Never ship a price target or fake prediction.
15. Run the production build. If it hangs on a stale `.next` lock, diagnose the existing process safely and rerun; do not use destructive broad deletion.
16. Review the final browser state at a judge-sized viewport and inspect console errors/warnings.
17. Commit the finished changes on this dedicated branch and update PR #55. The PR description should emphasize:
    - Aperture rename;
    - sourced scenario research with explicit assumptions;
    - primary explainable Shock graph;
    - reviewed CSV/XLSX/XLS imports;
    - level-specific analysis depth;
    - evidence integrity and browser verification.

## Do not do

- Do not commit API keys, OAuth secrets, Supabase service keys, database passwords, or `.env.local`.
- Do not claim an AI generated or searched answer when Gemini returned quota errors.
- Do not call an illustrative source excerpt a verbatim 10-K quote.
- Do not convert an election outcome into a tariff change without a user-stated policy assumption.
- Do not present historical ranges as stock predictions or price targets.
- Do not add another graph product, settings system, shock log, or route unless a concrete judging need requires it.
- Do not remove the X-Ray map, primary Shock graph, Radar feed, or IC Room workflow. Those are the parts the judges liked.

## Suggested PR smoke path

```text
Landing → Import → type AAPL + VOO → review rows → X-Ray
X-Ray → inspect NVIDIA overlap / True Top 10
Shock → run Commercial Real Estate decline
Shock → ask “What if Iran closes the Strait of Hormuz?”
Shock → inspect assumptions, source, graph links, and unmodeled holdings
Radar → inspect the feed and open a source
IC Room → run a new thesis and inspect bull/bear citations
Switch levels → confirm different data density and evidence depth
```

Finish only when this smoke path works, the tests and build have been run, and the PR is reviewable.
