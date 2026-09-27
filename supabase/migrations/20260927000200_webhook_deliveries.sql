-- Durable delivery suppression, not exactly-once arbitrary side effects.
-- Apply only through a separately authorized deployment; local PGlite tests use
-- this exact SQL. Rollback: disable receiver first, then a forward migration may
-- drop function/table (loses replay suppression). No provider payloads/secrets.
begin;
create table public.webhook_deliveries (
  delivery_key text primary key check (delivery_key ~ '^[a-f0-9]{64}$'),
  token uuid not null,
  state text not null check (state in ('processing', 'done')),
  expires_at timestamptz not null
);
create index webhook_deliveries_expiry on public.webhook_deliveries (expires_at);
alter table public.webhook_deliveries enable row level security;
revoke all on public.webhook_deliveries from public, anon, authenticated, service_role;

-- Fixed bounds: 120s processing lease, 24h successful retention, 100k rows.
-- A short transaction-wide lock serializes capacity checks and claims across
-- instances. No user work/network is performed while this lock is held.
create function public.webhook_delivery(p_operation text, p_key text, p_token uuid default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public set lock_timeout = '1s'
as $$
declare
  entry public.webhook_deliveries%rowtype;
  clock timestamptz;
  affected integer;
begin
  if p_key is null or p_key !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid delivery key';
  end if;
  if p_operation is null or p_operation not in ('claim', 'complete', 'release') then
    raise exception 'Invalid delivery operation';
  end if;
  perform pg_advisory_xact_lock(187240619, 2);
  clock := clock_timestamp();
  if p_operation = 'claim' then
    -- Opportunistic bounded retention sweep, also expires abandoned leases.
    delete from public.webhook_deliveries where delivery_key in (
      select delivery_key from public.webhook_deliveries
      where expires_at <= clock order by expires_at limit 1000
    );
    select * into entry from public.webhook_deliveries where delivery_key = p_key;
    if found and entry.expires_at > clock then
      return jsonb_build_object('state', case when entry.state = 'done' then 'duplicate' else 'busy' end);
    end if;
    -- Requested expired key may fall outside this sweep's first 1000 rows.
    delete from public.webhook_deliveries where delivery_key = p_key;
    if (select count(*) from public.webhook_deliveries) >= 100000 then
      return jsonb_build_object('state', 'full');
    end if;
    entry.token := gen_random_uuid();
    insert into public.webhook_deliveries values (p_key, entry.token, 'processing', clock + interval '120 seconds');
    return jsonb_build_object('state', 'claimed', 'token', entry.token);
  elsif p_operation = 'complete' then
    update public.webhook_deliveries set state = 'done', expires_at = clock + interval '24 hours'
    where delivery_key = p_key and token = p_token and state = 'processing' and expires_at > clock;
    get diagnostics affected = row_count;
    return jsonb_build_object('ok', affected = 1);
  else
    -- Stale completion/release must never mutate a replacement claim or a receipt.
    delete from public.webhook_deliveries where delivery_key = p_key and token = p_token and state = 'processing';
    return jsonb_build_object('ok', true);
  end if;
end;
$$;
revoke all on function public.webhook_delivery(text, text, uuid) from public, anon, authenticated;
grant execute on function public.webhook_delivery(text, text, uuid) to service_role;
commit;
