-- Accounts: profiles (experience level), saved portfolios and their holdings (PRD §6).
-- Row Level Security: every row belongs to one user and only that user can read or change it.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  experience_level text check (experience_level in ('beginner', 'intermediate', 'advanced')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null check (kind in ('real', 'practice', 'demo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index portfolios_user_id_idx on public.portfolios (user_id, updated_at desc);

create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ticker text not null check (ticker ~ '^[A-Z][A-Z.]{0,5}$'),
  name text not null default '',
  industry text,
  shares numeric not null check (shares > 0),
  -- Price when the portfolio was saved; live quotes replace it on load.
  price numeric not null check (price >= 0)
);
create index holdings_portfolio_id_idx on public.holdings (portfolio_id);

alter table public.profiles enable row level security;
alter table public.portfolios enable row level security;
alter table public.holdings enable row level security;

create policy "own profile" on public.profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "own portfolios" on public.portfolios
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- A holding must belong to the caller and sit in one of the caller's own portfolios.
create policy "own holdings" on public.holdings
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.portfolios p where p.id = portfolio_id and p.user_id = auth.uid())
  );

grant select, insert, update, delete on public.profiles, public.portfolios, public.holdings to authenticated;

-- Every new account gets a profile row.
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
