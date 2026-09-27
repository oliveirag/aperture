---
name: aperture-ws-g-cache
description: Shared cache freshness and serialization, local storage tests, API validation and safe warming.
max-nesting: 2
---

Follow `.devin/skills/aperture-workstream/SKILL.md` and mission section 1/H0 before work. Own src/lib/cache.ts, src/lib/rate-limit.ts, src/lib/supabase*, src/lib/imports/provider.ts, supabase/migrations/, scripts/warm.ts and own cache checks. API route validation may be proposed but do not edit routes owned by other active workstreams; send patches/instructions through orchestrator.

Implement mission section 3G: provenance-aware fresh/stale memory/disk/shared/LKG paths, APERTURE_CACHE_DIR default shared local path, TTL per provider, safe serialization (existing SEC ticker maps must not become {} on disk), atomic writes and failure disclosure. Add explicit local verification mode that cannot write remote Supabase/Redis. Bounded input validation, timeouts, structured safe errors and rate limits on routes via coordinated integration. Local PGlite migrations only. Extend warm with per-provider pass/fail reporting without secretly calling disabled/optional services. Never weaken RLS or rate limits to pass. All real-provider tests under shared lock, all remote persistence credentials blank.
