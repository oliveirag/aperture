-- Experience preference: when the level was last chosen, so the most recent explicit choice wins across devices
-- and tabs. The trigger keeps the newest choice even if an older write arrives late.
alter table public.profiles add column if not exists experience_level_updated_at timestamptz;

create or replace function public.keep_newest_experience_level() returns trigger
  language plpgsql set search_path = public as $$
begin
  if old.experience_level_updated_at is not null
     and new.experience_level_updated_at is not null
     and new.experience_level_updated_at < old.experience_level_updated_at then
    new.experience_level := old.experience_level;
    new.experience_level_updated_at := old.experience_level_updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_keep_newest_level on public.profiles;
create trigger profiles_keep_newest_level
  before update on public.profiles
  for each row execute function public.keep_newest_experience_level();
