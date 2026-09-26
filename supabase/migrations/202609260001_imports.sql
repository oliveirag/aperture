-- All mutations go through server-only RPCs. RLS protects direct client reads.
create table public.portfolios (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 holdings_hash text not null, identity_csv text not null, current_snapshot_id uuid,
 created_at timestamptz not null default now(), unique(owner_id, holdings_hash)
);
create table public.import_jobs (
 id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 portfolio_id uuid references public.portfolios(id), source text not null,
 status text not null default 'review' check(status in ('review','processing','needs_input','complete','cancelled')),
 original jsonb not null, rows jsonb not null, results jsonb not null default '[]',
 original_csv text not null, original_hash text not null, reviewed_csv text, reviewed_hash text, holdings_hash text,
 revision integer not null default 0, confirmed_at timestamptz, snapshot_id uuid,
 created_at timestamptz not null default now(), retry_at timestamptz not null default now(),
 lease_token uuid, lease_until timestamptz
);
create unique index one_active_import_per_portfolio on public.import_jobs(portfolio_id)
 where portfolio_id is not null and status in ('processing','needs_input');
create index import_work on public.import_jobs(retry_at, created_at) where status = 'processing';
create table public.import_images (
 job_id uuid primary key references public.import_jobs(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 mime_type text not null, image_data text not null,
 expires_at timestamptz not null default now()+interval '1 hour'
);
alter table public.import_images enable row level security;
-- Images are only readable through the authenticated server route and expire after one hour.
revoke all on public.import_images from anon,authenticated;
create table public.import_sessions(owner_id uuid primary key references auth.users(id) on delete cascade, cancel_epoch bigint not null default 0);
alter table public.import_sessions enable row level security;
revoke all on public.import_sessions from anon,authenticated;
create function public.import_epoch(p_owner uuid) returns bigint language plpgsql security definer set search_path=public as $$
declare epoch bigint;
begin
 insert into import_sessions(owner_id) values(p_owner) on conflict do nothing;
 select cancel_epoch into epoch from import_sessions where owner_id=p_owner;
 return epoch;
end $$;
create table public.portfolio_snapshots (
 id uuid primary key default gen_random_uuid(), portfolio_id uuid not null references public.portfolios(id),
 owner_id uuid not null references auth.users(id) on delete cascade, job_id uuid not null unique references public.import_jobs(id),
 created_at timestamptz not null default now(), model jsonb not null, rows jsonb not null, results jsonb not null,
 reviewed_hash text not null
);
create table public.import_events (
 id bigint generated always as identity primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 job_id uuid not null references public.import_jobs(id), created_at timestamptz not null default now(),
 event text not null, detail jsonb not null
);
create function public.audit_import_capture() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into import_events(owner_id,job_id,event,detail)
 values(new.owner_id,new.id,'captured',jsonb_build_object('source',new.source,'rows',jsonb_array_length(new.rows),'original_sha256',new.original_hash));
 return new;
end $$;
create trigger import_captured after insert on public.import_jobs for each row execute function public.audit_import_capture();
revoke all on function public.audit_import_capture() from public,anon,authenticated;
create table public.provider_cache (key text primary key, value jsonb not null, expires_at timestamptz not null, lease_token uuid, lease_until timestamptz);
create table public.provider_windows (provider text primary key, calls timestamptz[] not null default '{}', blocked_until timestamptz);

alter table public.portfolios enable row level security;
alter table public.import_jobs enable row level security;
alter table public.portfolio_snapshots enable row level security;
alter table public.import_events enable row level security;
alter table public.provider_cache enable row level security;
alter table public.provider_windows enable row level security;
create policy own_portfolios on public.portfolios for select to authenticated using(owner_id = auth.uid());
create policy own_imports on public.import_jobs for select to authenticated using(owner_id = auth.uid());
create policy own_snapshots on public.portfolio_snapshots for select to authenticated using(owner_id = auth.uid());
create policy own_events on public.import_events for select to authenticated using(owner_id = auth.uid());

create function public.claim_provider_cache(p_key text,p_token uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c provider_cache;
begin
 insert into provider_cache(key,value,expires_at) values(p_key,'{}','1970-01-01') on conflict do nothing;
 select * into c from provider_cache where key=p_key for update;
 if c.expires_at>now() then return jsonb_build_object('state','cached','value',c.value); end if;
 if c.lease_until>now() then return jsonb_build_object('state','waiting','retryAt',c.lease_until); end if;
 update provider_cache set lease_token=p_token,lease_until=now()+interval '20 seconds' where key=p_key;
 return jsonb_build_object('state','claimed');
end $$;

create function public.finish_provider_cache(p_key text,p_token uuid,p_value jsonb,p_expires timestamptz)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 update provider_cache set value=p_value,expires_at=p_expires,lease_token=null,lease_until=null where key=p_key and lease_token=p_token and lease_until>now();
 return found;
end $$;

create function public.reserve_provider(p_provider text, p_limit integer, p_seconds integer)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare w provider_windows; t timestamptz := clock_timestamp();
begin
 insert into provider_windows(provider) values(p_provider) on conflict do nothing;
 select * into w from provider_windows where provider = p_provider for update;
 if w.blocked_until > t then return w.blocked_until; end if;
 select coalesce(array_agg(x order by x), '{}') into w.calls from unnest(w.calls) x where x > t - make_interval(secs => p_seconds);
 if cardinality(w.calls) >= p_limit then return w.calls[1] + make_interval(secs => p_seconds); end if;
 update provider_windows set calls = array_append(w.calls,t) where provider = p_provider;
 return null;
end $$;

create function public.confirm_import(p_id uuid, p_owner uuid, p_revision integer, p_rows jsonb,
 p_csv text, p_hash text, p_identity text, p_identity_hash text)
returns uuid language plpgsql security definer set search_path = public as $$
declare j import_jobs; pid uuid; active uuid;
begin
 -- Serializes same-owner confirmations, including simultaneous identical uploads.
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 0));
 select * into j from import_jobs where id=p_id and owner_id=p_owner for update;
 if not found or j.status not in ('review','needs_input') or j.revision <> p_revision then raise exception 'Import changed; reload before confirming'; end if;
 insert into portfolios(owner_id,holdings_hash,identity_csv) values(p_owner,p_identity_hash,p_identity)
 on conflict(owner_id,holdings_hash) do nothing;
 select id into pid from portfolios where owner_id=p_owner and holdings_hash=p_identity_hash;
 select id into active from import_jobs where portfolio_id=pid and id<>p_id and status in ('processing','needs_input') limit 1;
 insert into import_events(owner_id,job_id,event,detail) values(p_owner,p_id,'review_confirmed',
 jsonb_build_object('before',j.rows,'after',p_rows,'csv',p_csv,'sha256',p_hash,'portfolio',pid,'joined_job',active));
 update import_jobs set rows=p_rows,reviewed_csv=p_csv,reviewed_hash=p_hash,holdings_hash=p_identity_hash,
 portfolio_id=pid,confirmed_at=now(),revision=revision+1,results='[]',retry_at=now(),lease_token=null,lease_until=null,
 status=case when active is null then 'processing' else 'cancelled' end where id=p_id;
 delete from import_images where job_id=p_id;
 return coalesce(active,p_id);
end $$;

create function public.save_screenshot(p_id uuid,p_owner uuid,p_rows jsonb,p_csv text,p_hash text,p_mime text,p_image text,p_epoch bigint)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 if import_epoch(p_owner)<>p_epoch then raise exception 'Logged out during extraction'; end if;
 insert into import_jobs(id,owner_id,source,original,rows,original_csv,original_hash)
 values(p_id,p_owner,'screenshot',p_rows,p_rows,p_csv,p_hash);
 insert into import_images(job_id,owner_id,mime_type,image_data) values(p_id,p_owner,p_mime,p_image);
end $$;

create function public.cancel_import_drafts(p_owner uuid,p_id uuid default null)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 if p_id is null then
  insert into import_sessions(owner_id,cancel_epoch) values(p_owner,1)
  on conflict(owner_id) do update set cancel_epoch=import_sessions.cancel_epoch+1;
 end if;
 update import_jobs set status='cancelled',lease_token=null,lease_until=null
 where owner_id=p_owner and status='review' and confirmed_at is null and (p_id is null or id=p_id);
 delete from import_images where owner_id=p_owner and (p_id is null or job_id=p_id)
 and job_id in (select id from import_jobs where status='cancelled');
end $$;

create function public.claim_import() returns setof public.import_jobs
language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
 select id into target from import_jobs where status in ('processing','review') and retry_at <= now()
 and (lease_until is null or lease_until < now()) order by created_at for update skip locked limit 1;
 if target is null then return; end if;
 return query update import_jobs set lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds'
 where id=target returning *;
end $$;

create function public.save_import_work(p_id uuid,p_token uuid,p_results jsonb,p_status text,p_retry timestamptz,p_model jsonb default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare j import_jobs; sid uuid;
begin
 select * into j from import_jobs where id=p_id and lease_token=p_token and lease_until>now() and status in ('processing','review') for update;
 if not found then return false; end if;
 if p_status not in ('review','processing','needs_input','complete') then raise exception 'Invalid worker status'; end if;
 if j.status='review' and p_status<>'review' then raise exception 'Review required'; end if;
 if p_status='complete' then
  if j.confirmed_at is null or p_model is null or jsonb_array_length(p_results) <> jsonb_array_length(j.rows)
   or exists(select 1 from jsonb_array_elements(p_results) r where r->>'state' <> 'ready') then raise exception 'Incomplete analysis'; end if;
  insert into portfolio_snapshots(portfolio_id,owner_id,job_id,model,rows,results,reviewed_hash)
  values(j.portfolio_id,j.owner_id,j.id,p_model,j.rows,p_results,j.reviewed_hash) returning id into sid;
  update portfolios set current_snapshot_id=sid where id=j.portfolio_id;
 end if;
 insert into import_events(owner_id,job_id,event,detail) values(j.owner_id,j.id,p_status,jsonb_build_object('results',p_results,'snapshot',sid));
 update import_jobs set results=p_results,status=p_status,retry_at=p_retry,snapshot_id=sid,lease_token=null,lease_until=null where id=p_id;
 return true;
end $$;

create function public.checkpoint_import(p_id uuid,p_token uuid,p_results jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare j import_jobs; changes jsonb;
begin
 select * into j from import_jobs where id=p_id and lease_token=p_token and lease_until>now() and status in ('processing','review') for update;
 if not found then return false; end if;
 select coalesce(jsonb_agg(jsonb_build_object('row',ordinality,'result',value)),'[]') into changes
 from jsonb_array_elements(p_results) with ordinality where value is distinct from j.results->(ordinality::integer-1);
 insert into import_events(owner_id,job_id,event,detail) values(j.owner_id,j.id,'position_progress',changes);
 update import_jobs set results=p_results where id=p_id;
 return true;
end $$;

-- Never expose privileged RPCs to anonymous or authenticated clients.
revoke all on function public.reserve_provider(text,integer,integer) from public,anon,authenticated;
revoke all on function public.import_epoch(uuid),public.save_screenshot(uuid,uuid,jsonb,text,text,text,text,bigint), public.cancel_import_drafts(uuid,uuid) from public,anon,authenticated;
grant execute on function public.import_epoch(uuid),public.save_screenshot(uuid,uuid,jsonb,text,text,text,text,bigint), public.cancel_import_drafts(uuid,uuid) to service_role;
revoke all on function public.claim_provider_cache(text,uuid),public.finish_provider_cache(text,uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_provider_cache(text,uuid),public.finish_provider_cache(text,uuid,jsonb,timestamptz) to service_role;
revoke all on function public.confirm_import(uuid,uuid,integer,jsonb,text,text,text,text) from public,anon,authenticated;
revoke all on function public.claim_import() from public,anon,authenticated;
revoke all on function public.save_import_work(uuid,uuid,jsonb,text,timestamptz,jsonb) from public,anon,authenticated;
revoke all on function public.checkpoint_import(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_provider(text,integer,integer), public.confirm_import(uuid,uuid,integer,jsonb,text,text,text,text),
 public.claim_import(),public.save_import_work(uuid,uuid,jsonb,text,timestamptz,jsonb) to service_role;
grant execute on function public.checkpoint_import(uuid,uuid,jsonb) to service_role;
revoke insert,update,delete on public.portfolios,public.import_jobs,public.portfolio_snapshots,public.import_events from anon,authenticated;
grant select on public.portfolios,public.import_jobs,public.portfolio_snapshots,public.import_events to authenticated;

-- Expire abandoned drafts and delete their private temporary screenshots.
-- Schedule cleanup and worker invocations using the deployment instructions in docs/IMPORTS.md.
