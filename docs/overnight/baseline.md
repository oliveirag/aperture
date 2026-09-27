# Baseline execution evidence

Iteration 1, 2026-09-27. Base: origin/main at 06d5e3c. No application changes preceded these commands.

## Dependency installation

Command: `npm ci` — exit 0.

```text
npm warn deprecated node-domexception@1.0.0: Use your platform's native DOMException instead
npm warn deprecated eslint@9.39.5: This version is no longer supported.
added 811 packages, and audited 812 packages in 1m
found 0 vulnerabilities
```

## Release and individual checks

Command: `npm run test:release && for script in scripts/check-*.ts; do printf '\n=== %s ===\n' "$script"; node --import tsx "$script" || exit $?; done` — exit 0.

Supabase URL/anon/service-role credentials, Gemini keys and Upstash/KV URL/token variables explicitly blank in the child process. No `.env.local` loader used by these check scripts. The fallback suite uses its own temporary disk cache.

```text
> node --import tsx scripts/check-aperture-release.ts && node --import tsx scripts/check-fallbacks.ts
PASS: oil/tariff parsing, deterministic math, signs, sector residual, graph links, finite inputs, CSV/XLS/XLSX and sheet selection
[cache] check:lkg:1790491036213: load failed, serving last known good value: sec 503
fallbacks OK

=== scripts/check-aperture-release.ts ===
PASS: oil/tariff parsing, deterministic math, signs, sector residual, graph links, finite inputs, CSV/XLS/XLSX and sheet selection
=== scripts/check-aperture.ts ===
compute OK
=== scripts/check-ask.ts ===
ask OK
=== scripts/check-canon.ts ===
canon OK
=== scripts/check-csv.ts ===
csv OK
=== scripts/check-fallbacks.ts ===
[cache] check:lkg:1790491038379: load failed, serving last known good value: sec 503
fallbacks OK
=== scripts/check-graph.ts ===
cre { nodes: 92, driver: 1, channel: 3, holding: 7, company: 72, source: 9 }
links { shock: 42, aperture: 41, context: 56, evidence: 9, maxDepth: 4 }
holdings VOO d=3 r=-0.013, QQQ d=4 r=null, NVDA d=Infinity r=null, KRE d=2 r=-0.155, AAPL d=Infinity r=null, BXP d=2 r=-0.225, MSFT d=Infinity r=null
hit without quotes: []
ai-capex { nodes: 107, driver: 1, channel: 2, holding: 7, company: 90, source: 7 }
links { shock: 22, aperture: 31, context: 85, evidence: 9, maxDepth: 2 }
holdings VOO d=2 r=-0.024, QQQ d=2 r=-0.055, NVDA d=2 r=-0.24, KRE d=Infinity r=null, AAPL d=Infinity r=null, BXP d=Infinity r=null, MSFT d=2 r=-0.06
hit without quotes: []
=== scripts/check-ic.ts ===
ic OK
=== scripts/check-import-selection.ts ===
Snapshot selection checks passed: activation, refresh, demo and practice transitions.
=== scripts/check-imports.ts ===
Import checks passed: row preservation, identity, valuation isolation, cash denominator, migration, job deduplication, lease fencing, snapshot atomicity and quota.
=== scripts/check-limits.ts ===
limits OK
=== scripts/check-listen.ts ===
listen OK
=== scripts/check-performance.ts ===
performance OK
=== scripts/check-radar.ts ===
radar OK
=== scripts/check-rls.ts ===
rls OK
=== scripts/check-search.ts ===
search OK
=== scripts/check-shock.ts ===
shock OK
=== scripts/check-snap.ts ===
snap OK
=== scripts/check-webhook.ts ===
webhook OK
```

Graph output is condensed to one line per object above; values are unchanged. The graph script prints diagnostics rather than asserting absence of null/Infinity. This output does not prove the mission's UI constraints or real provider correctness.

## Type generation, TypeScript and lint

Command: `npx --no-install next typegen && npx --no-install tsc --noEmit && npm run lint` — combined exit 1.

Type generation and TypeScript succeeded before lint ran. Supabase and Gemini credentials blank in the child environment.

```text
Generating route types...
✓ Types generated successfully
> aperture@0.1.0 lint
> eslint

/Users/zakariakhan/Documents/lookthru/docs/audit-2026-09-27/extract-inventory.cjs
  1:10  error  A `require()` style import is forbidden  @typescript-eslint/no-require-imports
  1:29  error  A `require()` style import is forbidden  @typescript-eslint/no-require-imports
  1:48  error  A `require()` style import is forbidden  @typescript-eslint/no-require-imports

3 problems (3 errors, 0 warnings)
```

## Production build

Command: `npm run build -- --webpack` — exit 0.

Supabase URL/anon/service-role, Gemini, Finnhub, Alpha Vantage and Upstash/KV credentials explicitly blank in the child process; Next reported `.env.local` as an environment file but explicit empty process values take precedence. No secrets were printed.

```text
▲ Next.js 16.3.6 (webpack)
- Environments: .env.local
✓ Running next.config.ts took 193ms
Creating an optimized production build ...
✓ Compiled successfully in 10.1s
Running TypeScript ...
Finished TypeScript in 6.5s ...
Collecting page data using 7 workers ...
Generating static pages using 7 workers (0/37) ...
Generating static pages using 7 workers (9/37) ...
Generating static pages using 7 workers (18/37) ...
Generating static pages using 7 workers (27/37) ...
✓ Generating static pages using 7 workers (37/37) in 580ms
Finalizing page optimization ...
Collecting build traces ...
```

Build listed all application and API routes successfully. Full live/browser verification has not been run.

## Harness health

`devin doctor --json` — exit 0; `ok: true`; 68 custom ECC profiles loaded. Five CFG005 warnings: unsupported `color` metadata on gan-planner, harness-optimizer, gan-evaluator, loop-operator and gan-generator. No new hooks or permissions configured.

`command -v agentshield` — exit 1, no executable found.
