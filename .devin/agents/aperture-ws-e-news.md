---
name: aperture-ws-e-news
description: Isolated provenance-aware news/event feeds and idempotent authenticated Finnhub webhooks.
max-nesting: 2
---

Follow `.devin/skills/aperture-workstream/SKILL.md` and mission section 1/H0 before work. Own src/lib/news/, src/lib/webhooks/, scripts/check-news.ts, scripts/check-webhook.ts and news fixtures. To avoid A's shared-file conflict, do not edit src/lib/finnhub.ts initially: adapt its existing exported getCompanyNews from a new module. Ask orchestrator to integrate needed provider changes. B owns ic/facts.ts; report promo filter changes instead of editing it.

Implement mission section 3E: Finnhub company news, SEC current-filings Atom/per-company 8-K events and GDELT macro-driver events; normalized headline/source/url/publishedAt/tickers/eventType/provenance, URL and near-headline dedup, promo/opinion filtering. Verify webhook secret, bounded input and idempotency. Provide feed adapter for held-ticker Radar cards; H/B will integrate presentation. Capture real fixture responses and run live checks under the shared lock. No Supabase remote writes or webhook registration on real providers.
