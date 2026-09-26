-- Accounts (GUI-60 / #31): profiles, saved portfolios and holdings, per PRD section 6.
-- Every table has Row Level Security; a signed-in user can only read and write their own rows.
-- Run once in the Supabase SQL editor (or `supabase db push`).

create type public.experience_level as enum ('beginner', 'intermediate', 'advanced');
create type public.portfolio_kind as enum ('real', 'practice');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  experience_level public.experience_level,
  created_at timestamptz not null default now()
);

-- One saved portfolio per kind per user: the imported ("real") one and the practice one.
create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.portfolio_kind not null,
  name text not null default 'My portfolio',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind)
);

-- user_id is repeated here so the policy is a plain column check (no join per row).
create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ticker text not null check (ticker ~ '^[A-Z][A-Z.]{0,5}$'),
  name text not null,
  industry text,
  shares numeric not null check (shares > 0),
  -- Price when the portfolio was saved; the app reprices live with Finnhub.
  price numeric not null check (price >= 0),
  position int not null default 0
);
create index holdings_portfolio_idx on public.holdings (portfolio_id);

alter table public.profiles enable row level security;
alter table public.portfolios enable row level security;
alter table public.holdings enable row level security;

create policy "own profile: read" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "own profile: update" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "own profile: insert" on public.profiles for insert to authenticated with check (id = (select auth.uid()));

create policy "own portfolios" on public.portfolios for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- A holding must belong to the caller and sit in one of the caller's portfolios.
create policy "own holdings" on public.holdings for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.portfolios p where p.id = portfolio_id and p.user_id = (select auth.uid()))
  );

-- Anonymous visitors (the demo) never touch these tables.
revoke all on public.profiles, public.portfolios, public.holdings from anon;

-- A profile row appears on first sign-in, filled from the Google account.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Replaces the caller's portfolio of one kind in a single transaction. Runs as the caller (security invoker),
-- so the policies above still apply. p_holdings: [{ticker, name, industry, shares, price}].
create function public.save_portfolio(p_kind public.portfolio_kind, p_holdings jsonb)
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  pid uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  if jsonb_typeof(p_holdings) <> 'array' or jsonb_array_length(p_holdings) = 0 or jsonb_array_length(p_holdings) > 50 then
    raise exception 'holdings must be an array of 1 to 50 positions';
  end if;

  insert into public.portfolios (user_id, kind) values ((select auth.uid()), p_kind)
  on conflict (user_id, kind) do update set updated_at = now()
  returning id into pid;

  delete from public.holdings where portfolio_id = pid;

  insert into public.holdings (portfolio_id, user_id, ticker, name, industry, shares, price, position)
  select pid, (select auth.uid()), h ->> 'ticker', coalesce(h ->> 'name', h ->> 'ticker'), h ->> 'industry',
         (h ->> 'shares')::numeric, (h ->> 'price')::numeric, (ord - 1)::int
  from jsonb_array_elements(p_holdings) with ordinality as t (h, ord);

  return pid;
end;
$$;

revoke all on function public.save_portfolio (public.portfolio_kind, jsonb) from public, anon;
grant execute on function public.save_portfolio (public.portfolio_kind, jsonb) to authenticated;
