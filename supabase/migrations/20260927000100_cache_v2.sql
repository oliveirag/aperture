-- LOCAL PGLITE VERIFIED ONLY. The orchestrator/team must approve applying this remotely.
-- Cache v1 omitted original cache time and destroyed Maps during JSON serialization.
-- Force one quota-limited refresh rather than inventing timestamps or silently serving those entries.
-- Keep the old value for operator inspection; no account/import data, grants, RLS or quotas change.
-- Forward-only data migration: rollback does not restore unverifiable freshness. Re-warm providers instead.
update public.provider_cache
set expires_at = least(expires_at, now())
where not (value ? 'cacheRecord');
