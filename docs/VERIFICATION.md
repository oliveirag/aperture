# Release verification

Verified locally on September 26, 2026.

- Typed AAPL/VOO import priced both rows, required review, and opened the imported X-Ray.
- CSV, XLSX, and legacy XLS imports priced successfully. Multi-sheet workbooks required an explicit worksheet choice.
- Gemini read the seven-position brokerage screenshot; the reviewed result remained an imported portfolio rather than silently switching to demo data.
- X-Ray changed visible tables and analysis depth across Beginner, Intermediate, and Advanced.
- The primary Shock page rendered the graph for CRE, AI spending, Hormuz, and an explicit tariff-decrease scenario. Severity changes recalculated results; unknown exposure and assumptions stayed visible.
- Hormuz used the labeled EIA reference fallback while live Gemini grounding was quota-blocked. Election-only, combined-driver, percentage-point, and out-of-range questions are rejected.
- Filing Radar retrieved SEC comparisons, displayed verified filing passages, and kept the illustrative feed separately labeled.
- A new AAPL IC thesis completed with cited facts and computed portfolio fit. The AMD replay remained behind its explicit labeled button.
- Browser console checks on the exercised pages showed no errors or warnings.

Automated verification:

```sh
npm run test:release
npx next typegen
npx tsc --noEmit
npm run lint
npm run build -- --webpack
```

The production build used Next.js's webpack fallback because Turbopack could not bind its internal worker port in the sandbox. The webpack build compiled, type-checked, generated 35 static pages, and collected build traces successfully.
