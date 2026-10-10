-- Car catalogue: makes (with logos), models, generations and engines, for type-ahead on the car and job forms.
-- A shared list like brands: members add (a new make, model, generation or engine typed on a form is added
-- when the form is saved), admins edit and delete. The starting data comes from the next migration.
--
-- Cars and jobs keep make/model/engine as plain text: the catalogue only suggests.

create table public.car_makes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  -- a file in public/car-logos/ (e.g. "skoda.svg"); without one the app shows the initials
  logo text check (logo is null or logo ~ '^[a-z0-9-]+\.(svg|png|webp)$'),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
create unique index car_makes_name_key on public.car_makes (lower(name));

create table public.car_models (
  id uuid primary key default gen_random_uuid(),
  make_id uuid not null references public.car_makes (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
create unique index car_models_name_key on public.car_models (make_id, lower(name));

-- "IV (1J)" 1997–2003: what workshop people and parts shops call one version of a model
create table public.car_generations (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.car_models (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  year_from integer check (year_from between 1900 and 2100),
  year_to integer check (year_to between 1900 and 2100),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint car_generations_years check (year_to is null or year_from is null or year_to >= year_from)
);
create unique index car_generations_name_key on public.car_generations (model_id, lower(name));

-- "1.9 TDI 77 kW (105 HP)", Diesel
create table public.car_engines (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.car_generations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  fuel text check (fuel is null or char_length(fuel) between 1 and 30),
  power_kw integer check (power_kw between 1 and 2000),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
create unique index car_engines_name_key on public.car_engines (generation_id, lower(name), coalesce(fuel, ''));

create trigger car_makes_audit before insert or update on public.car_makes
  for each row execute function app.stamp_audit();
create trigger car_models_audit before insert or update on public.car_models
  for each row execute function app.stamp_audit();
create trigger car_generations_audit before insert or update on public.car_generations
  for each row execute function app.stamp_audit();
create trigger car_engines_audit before insert or update on public.car_engines
  for each row execute function app.stamp_audit();

alter table public.car_makes enable row level security;
alter table public.car_models enable row level security;
alter table public.car_generations enable row level security;
alter table public.car_engines enable row level security;

revoke all on public.car_makes, public.car_models, public.car_generations, public.car_engines from anon, authenticated;
grant all on public.car_makes, public.car_models, public.car_generations, public.car_engines to service_role;
grant select, insert, update, delete on public.car_makes, public.car_models, public.car_generations, public.car_engines to authenticated;

create policy "members read car makes" on public.car_makes
  for select to authenticated using ((select app.is_member()));
create policy "members add car makes" on public.car_makes
  for insert to authenticated with check ((select app.is_member()));
create policy "admins edit car makes" on public.car_makes
  for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy "admins delete car makes" on public.car_makes
  for delete to authenticated using ((select app.is_admin()));

create policy "members read car models" on public.car_models
  for select to authenticated using ((select app.is_member()));
create policy "members add car models" on public.car_models
  for insert to authenticated with check ((select app.is_member()));
create policy "admins edit car models" on public.car_models
  for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy "admins delete car models" on public.car_models
  for delete to authenticated using ((select app.is_admin()));

create policy "members read car generations" on public.car_generations
  for select to authenticated using ((select app.is_member()));
create policy "members add car generations" on public.car_generations
  for insert to authenticated with check ((select app.is_member()));
create policy "admins edit car generations" on public.car_generations
  for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy "admins delete car generations" on public.car_generations
  for delete to authenticated using ((select app.is_admin()));

create policy "members read car engines" on public.car_engines
  for select to authenticated using ((select app.is_member()));
create policy "members add car engines" on public.car_engines
  for insert to authenticated with check ((select app.is_member()));
create policy "admins edit car engines" on public.car_engines
  for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy "admins delete car engines" on public.car_engines
  for delete to authenticated using ((select app.is_admin()));

-- ---------------------------------------------------------------------------
-- Cars and customers' cars get a generation; customers' cars also a year and an engine (for buying parts)
-- ---------------------------------------------------------------------------
alter table public.cars add column generation text check (generation is null or char_length(generation) <= 40);

alter table public.jobs
  add column car_generation text check (car_generation is null or char_length(car_generation) <= 40),
  add column car_year integer check (car_year between 1900 and 2100),
  add column car_engine text check (car_engine is null or char_length(car_engine) <= 60);
grant insert (car_generation, car_year, car_engine) on public.jobs to authenticated;
grant update (car_generation, car_year, car_engine) on public.jobs to authenticated;
