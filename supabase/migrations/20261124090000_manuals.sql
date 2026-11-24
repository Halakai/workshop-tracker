-- Repair manuals: which manual belongs to a car, and the manuals' indexes (titles and addresses only; the pages
-- themselves are read on workshop-manuals.com).
--
--   car_manuals     the team's choice for a kind of car (make, model, generation, engine): the manual, and which of
--                   its engines and gearboxes to show. Without a choice the app picks the manual itself.
--   manual_lists    the names of every manual the site has   \  kept by the manuals function (service role only),
--   manual_indexes  a manual's chapters and pages            /  so the site is asked once per manual
--
-- The last two aren't readable by members, so they stay out of the backups (app.backup_tables): they can always be
-- fetched again.

create table public.car_manuals (
  id uuid primary key default gen_random_uuid(),
  make text not null check (char_length(make) between 1 and 40 and make = btrim(make)),
  model text not null check (char_length(model) between 1 and 60 and model = btrim(model)),
  generation text not null default '' check (char_length(generation) <= 40 and generation = btrim(generation)),
  engine text not null default '' check (char_length(engine) <= 60 and engine = btrim(engine)),
  manual_slug text not null check (manual_slug ~ '^[a-z0-9][a-z0-9_.,()&+-]{1,150}$'),
  -- names of the manual's engine and gearbox parts to show; empty: the app guesses the engine and shows every gearbox
  parts text[] not null default '{}' check (cardinality(parts) <= 60),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
create unique index car_manuals_car_key on public.car_manuals (lower(make), lower(model), lower(generation), lower(engine));

create trigger car_manuals_audit before insert or update on public.car_manuals
  for each row execute function app.stamp_audit();

alter table public.car_manuals enable row level security;
revoke all on public.car_manuals from anon, authenticated;
grant all on public.car_manuals to service_role;
grant select, insert, update on public.car_manuals to authenticated;

create policy "members read car manuals" on public.car_manuals
  for select to authenticated using ((select app.is_member()));
create policy "members choose car manuals" on public.car_manuals
  for insert to authenticated with check ((select app.is_member()));
create policy "members change car manuals" on public.car_manuals
  for update to authenticated using ((select app.is_member())) with check ((select app.is_member()));

create table public.manual_lists (
  id integer primary key default 1 check (id = 1),
  slugs text[] not null,
  fetched_at timestamptz not null default now()
);

create table public.manual_indexes (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9_.,()&+-]{1,150}$'),
  title text not null,
  base text not null,
  -- [{ title, kind, start }]: start is the position of the chapter's first page
  chapters jsonb not null,
  -- the pages' addresses below base, one per line, in the manual's order
  pages text not null,
  page_count integer not null check (page_count > 0),
  fetched_at timestamptz not null default now()
);

alter table public.manual_lists enable row level security;
alter table public.manual_indexes enable row level security;
revoke all on public.manual_lists, public.manual_indexes from anon, authenticated;
grant all on public.manual_lists, public.manual_indexes to service_role;
