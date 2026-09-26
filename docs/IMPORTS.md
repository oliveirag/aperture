# Unfold durable imports

## Setup

1. Create a Supabase project. Apply `supabase/migrations/202609260001_imports.sql` in its SQL editor (or through the Supabase CLI).
2. Copy the Supabase URL and anon/publishable key into the `NEXT_PUBLIC_SUPABASE_*` variables in `.env.example`. Set `SUPABASE_SERVICE_ROLE_KEY` on the server only. Never prefix this secret with `NEXT_PUBLIC_`.
3. Set Finnhub and Alpha Vantage API keys and a randomly generated `IMPORT_WORKER_SECRET`. Deploy the app to Vercel with the same environment variables.
4. Enable Supabase email authentication. In the email sign-in template, include `{{ .Token }}` so users can enter the email OTP on the import page. Configure SMTP for any use beyond Supabase's built-in email limits.
5. Enable Supabase Cron (`pg_cron`), `pg_net`, and Vault. Save secrets named `unfold_url` (your production HTTPS origin) and `unfold_worker_secret`. Run the scheduler SQL below once. Never put secrets in committed SQL.

```sql
select cron.schedule('unfold-import-worker', '* * * * *', $$
 select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets where name='unfold_url') || '/api/imports/worker',
   headers := jsonb_build_object('Content-Type','application/json','Authorization',
     'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='unfold_worker_secret')),
   body := '{}'::jsonb,
   timeout_milliseconds := 55000
 );
$$);
select cron.schedule('unfold-draft-expiry','* * * * *', $$
 update public.import_jobs set status='cancelled'
 where status='review' and confirmed_at is null and created_at < now()-interval '1 hour';
 delete from public.import_images where expires_at <= now()
 or job_id in (select id from public.import_jobs where status='cancelled');
 delete from public.provider_cache where expires_at < now()-interval '1 day';
$$);
```

The worker is an authenticated Vercel route invoked by Supabase Cron; it does not depend on Vercel Hobby cron or an open browser. A confirmation also triggers an immediate bounded batch. Configure Vercel deployment protection to allow the scheduler's request if protection is enabled. Free projects can pause or exhaust quotas: queued data remains durable, but processing requires an available database and runtime.

## Guarantees and behavior

- Every reviewed source row stays in the draft and audit CSV. Explicit exclusions require a reason. No import silently truncates its positions.
- User-scoped normalized holdings identity merges duplicate submissions, never doubles their quantities. Separate original/reviewed CSV hashes preserve provenance. Identity ignores current prices and includes USD cash balances.
- A matching active job is reused. Completed work produces a new immutable snapshot; only a successful snapshot replaces the portfolio's current pointer.
- Provider request windows live in Postgres. Database failure fails closed. Quotes and profiles are cached across workers; cache hits consume no provider quota.
- Leased jobs use fenced writes, so an expired worker cannot publish over a replacement worker. At-least-once processing may repeat a provider request after a crash, but cannot duplicate a snapshot.
- Work runs in batches of four positions, with a durable checkpoint after each batch. Provider responses are cached before being consumed by the worker. The rolling quota is reserved atomically for every request, including concurrent batches.
- Screenshots are temporarily held in the private `import_images` table, inaccessible to direct browser database queries. An authenticated route serves only the owner's unexpired image. Refreshing review can restore it. Confirmation transactionally deletes it; logout transactionally cancels drafts and deletes their images. A scheduled cleanup removes expired images. Confirmed CSV records and jobs survive logout.
- Saved analyses use fixed valuations; changing market prices do not rewrite history. Cash contributes to the denominator but is not an equity exposure.
- ETF records need dated, reconcilable holdings. Missing/nested fund data stays blocked rather than guessed. Non-equity exposures are disclosed outside equity look-through.

## Coverage limitations

Accepting a US-listed ETF is not a guarantee the free provider supplies dated, full constituent coverage. The worker explicitly blocks incomplete or ambiguous data. No alternate free provider with equivalent coverage has been verified. Alpha Vantage responses without a holdings date cannot establish an accurate audit date and are therefore blocked. This requirement can materially restrict live ETF coverage; do not present the seeded demo data as newly verified live data.

Provider quotas are configured conservatively at 55 Finnhub calls per rolling minute and 25 Alpha Vantage calls per rolling day. Profiles stop at 45 total Finnhub calls, reserving headroom for quotes. The API key must not be shared with applications outside this limiter if these budgets are to be authoritative. Per-key database leases prevent concurrent workers from fetching the same uncached security; expired leases permit crash recovery.

## Verification before deployment

Run typecheck, lint, import checks and existing look-through checks. On a real test project, verify authentication/RLS with two different users, 120+ rows, identical simultaneous submissions, worker interruption, forced quota exhaustion, logout during review, and snapshot history after refresh. Configure the scheduler and verify its HTTP results before relying on unattended work.
