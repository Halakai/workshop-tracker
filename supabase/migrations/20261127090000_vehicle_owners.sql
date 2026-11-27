-- R6 · V1: every car has an owner (docs/PLAN.md §13).
--
--   workshop  flips (for_sale) and the workshop's own vehicles (not for sale): money as before
--   member    a member's own car: no workshop money; private when its owner added it and wants it so
--   customer  someone else's car (a contact): work on it goes through jobs
--
-- A private car is invisible to the other members, and so are its photos, papers, keys, website listing and
-- activity. Backups still hold everything (backup_table() below), otherwise a restore would erase those cars.

-- ---------------------------------------------------------------------------
-- Owner columns
-- ---------------------------------------------------------------------------
alter table public.cars
  add column owner_kind text not null default 'workshop' check (owner_kind in ('workshop', 'member', 'customer')),
  add column owner_member_id uuid references public.profiles (id),
  add column owner_contact_id uuid references public.contacts (id),
  -- workshop cars only: a flip (true) or the workshop's own vehicle (false)
  add column for_sale boolean not null default true,
  add column is_private boolean not null default false,
  add constraint cars_owner check (
    case owner_kind
      when 'workshop' then owner_member_id is null and owner_contact_id is null
      when 'member' then owner_member_id is not null and owner_contact_id is null and not for_sale
      when 'customer' then owner_contact_id is not null and owner_member_id is null and not for_sale
    end
  ),
  -- only a car its owner added can be private
  add constraint cars_private check (not is_private or (owner_kind = 'member' and owner_member_id = created_by));

create index cars_owner_member_idx on public.cars (owner_member_id);
create index cars_owner_contact_idx on public.cars (owner_contact_id);

-- Who can see a car: everyone, unless it is someone else's private car. True for a car that doesn't exist
-- (rows left behind by a deleted car) and outside a user's session (migrations, the service role).
create function app.car_visible(p_car_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is null
    or coalesce((select not c.is_private or c.owner_member_id = auth.uid() from public.cars c where c.id = p_car_id), true);
$$;
revoke all on function app.car_visible(uuid) from public;
grant execute on function app.car_visible(uuid) to authenticated, service_role;

-- Owner rules on every save
create function app.cars_owner_rules() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_kind <> 'workshop' then
    new.for_sale := false;
  end if;
  if new.owner_kind <> 'member' or new.owner_member_id is distinct from new.created_by then
    new.is_private := false;
  end if;

  if tg_op = 'UPDATE' then
    if new.is_private is distinct from old.is_private and auth.uid() is distinct from old.owner_member_id and auth.uid() is not null then
      raise exception 'Only the owner can make a car private or show it to the others' using errcode = '42501';
    end if;
    if (new.owner_kind = 'workshop') is distinct from (old.owner_kind = 'workshop')
       and (exists (select 1 from public.transactions t where t.car_id = new.id)
            or exists (select 1 from public.stock_movements m where m.car_id = new.id)) then
      raise exception 'This car has money entries, so it can''t move between the workshop and another owner' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- after cars_audit (triggers run by name), so created_by is already set
create trigger cars_owner_rules before insert or update on public.cars
  for each row execute function app.cars_owner_rules();

-- Profit shares only for the workshop's cars
create or replace function app.cars_default_shares() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_kind = 'workshop' then
    insert into public.car_shares (car_id, partner_id, share_bp)
    select new.id, p.id, p.default_share_bp
    from public.profiles p
    where p.is_active and p.default_share_bp > 0
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create function app.cars_shares_follow_owner() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_kind = 'workshop' and old.owner_kind <> 'workshop' then
    insert into public.car_shares (car_id, partner_id, share_bp)
    select new.id, p.id, p.default_share_bp
    from public.profiles p
    where p.is_active and p.default_share_bp > 0
    on conflict do nothing;
  elsif new.owner_kind <> 'workshop' and old.owner_kind = 'workshop' then
    delete from public.car_shares where car_id = new.id;
  end if;
  return new;
end;
$$;

create trigger cars_shares_follow_owner after update of owner_kind on public.cars
  for each row execute function app.cars_shares_follow_owner();

-- Money on a car is the workshop's: no purchases, parts, costs, sales or stock on other people's cars
create function app.money_only_on_workshop_cars() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.car_id is not null and exists (select 1 from public.cars c where c.id = new.car_id and c.owner_kind <> 'workshop') then
    raise exception 'Only the workshop''s cars have money entries' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger transactions_workshop_cars before insert or update of car_id on public.transactions
  for each row execute function app.money_only_on_workshop_cars();
create trigger stock_movements_workshop_cars before insert on public.stock_movements
  for each row execute function app.money_only_on_workshop_cars();

-- ---------------------------------------------------------------------------
-- Privacy
-- ---------------------------------------------------------------------------
drop policy "members read cars" on public.cars;
drop policy "members edit unsettled cars" on public.cars;
drop policy "members delete unsettled cars" on public.cars;

create policy "members read cars" on public.cars
  for select to authenticated
  using ((select app.is_member()) and (not is_private or owner_member_id = (select auth.uid())));
create policy "members edit unsettled cars" on public.cars
  for update to authenticated
  using ((select app.is_member()) and settled_at is null and (not is_private or owner_member_id = (select auth.uid())))
  with check ((select app.is_member()) and settled_at is null);
-- only works while nothing is attached to the car (foreign keys)
create policy "members delete unsettled cars" on public.cars
  for delete to authenticated
  using ((select app.is_member()) and settled_at is null and (not is_private or owner_member_id = (select auth.uid())));

-- Restrictive policies: on top of each table's own rules, a private car's rows stay with its owner
create policy "private cars' files" on public.attachments
  as restrictive for all to authenticated
  using (entity_type <> 'car' or app.car_visible(entity_id))
  with check (entity_type <> 'car' or app.car_visible(entity_id));

create policy "private cars' activity" on public.activity_log
  as restrictive for select to authenticated
  using (entity_type <> 'car' or entity_id is null or app.car_visible(entity_id));

create policy "private cars' keys" on public.access_keys
  as restrictive for all to authenticated
  using (car_id is null or app.car_visible(car_id))
  with check (car_id is null or app.car_visible(car_id));

create policy "private cars' listing" on public.website_cars
  as restrictive for all to authenticated
  using (car_id is null or app.car_visible(car_id))
  with check (car_id is null or app.car_visible(car_id));

-- create_access_key() runs as the database, so it checks here too
create function app.keys_for_visible_cars() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.car_id is not null and not app.car_visible(new.car_id) then
    raise exception 'Car not found';
  end if;
  return new;
end;
$$;

create trigger access_keys_visible_car before insert on public.access_keys
  for each row execute function app.keys_for_visible_cars();

-- ---------------------------------------------------------------------------
-- Jobs are done on a car (any car the member can see) and note its mileage
-- ---------------------------------------------------------------------------
alter table public.jobs
  add column car_id uuid references public.cars (id),
  add column mileage_km integer check (mileage_km >= 0);
create index jobs_car_idx on public.jobs (car_id);

grant insert (car_id, mileage_km) on public.jobs to authenticated;
grant update (car_id, mileage_km) on public.jobs to authenticated;

create function app.jobs_visible_car() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.car_id is not null and (tg_op = 'INSERT' or new.car_id is distinct from old.car_id) and not app.car_visible(new.car_id) then
    raise exception 'Car not found';
  end if;
  return new;
end;
$$;

create trigger jobs_visible_car before insert or update of car_id on public.jobs
  for each row execute function app.jobs_visible_car();

-- ---------------------------------------------------------------------------
-- Customers' cars from the jobs done so far: one car per customer and plate (or make and model when the
-- plate is missing), with the details of its latest job; the jobs are linked to it.
-- ---------------------------------------------------------------------------
create temporary table job_cars as
select
  j.id as job_id,
  j.customer_id,
  case when nullif(btrim(j.car_plate), '') is not null then 'p:' || upper(regexp_replace(j.car_plate, '[\s-]', '', 'g'))
       else 'm:' || lower(btrim(coalesce(j.car_make, ''))) || '|' || lower(btrim(coalesce(j.car_model, '')))
  end as car_key,
  j.created_at,
  j.created_by
from public.jobs j
where nullif(btrim(j.car_plate), '') is not null or nullif(btrim(j.car_make), '') is not null;

create temporary table new_cars as
with groups as (
  select customer_id, car_key, min(created_at) as first_at,
         (array_agg(created_by order by created_at))[1] as first_by,
         (array_agg(job_id order by created_at desc))[1] as latest_job
  from job_cars
  group by customer_id, car_key
),
numbered as (
  select g.*,
         (coalesce((select max((substring(c.ref from '^CAR-([0-9]+)$'))::integer) from public.cars c where c.ref ~ '^CAR-[0-9]+$'), 0)
          + row_number() over (order by g.first_at, g.latest_job))::text as n
  from groups g
)
select gen_random_uuid() as id, 'CAR-' || lpad(n, greatest(3, length(n)), '0') as ref, numbered.*
from numbered;

-- rows go in as they were (who added them and when), without activity lines or profit shares
alter table public.cars disable trigger user;
insert into public.cars (
  id, ref, owner_kind, owner_contact_id, for_sale, make, model, generation, year, engine, plate, vin,
  purchase_date, created_at, created_by, updated_at, updated_by
)
select
  n.id, n.ref, 'customer', n.customer_id, false,
  coalesce(left(nullif(btrim(j.car_make), ''), 40), 'Unknown'),
  coalesce(left(nullif(btrim(j.car_model), ''), 60), 'Unknown'),
  j.car_generation, j.car_year, j.car_engine, upper(j.car_plate), upper(j.car_vin),
  n.first_at::date, n.first_at, n.first_by, n.first_at, n.first_by
from new_cars n
join public.jobs j on j.id = n.latest_job;
alter table public.cars enable trigger user;

alter table public.jobs disable trigger user;
update public.jobs j
set car_id = n.id
from job_cars jc
join new_cars n on n.customer_id = jc.customer_id and n.car_key = jc.car_key
where j.id = jc.job_id;
alter table public.jobs enable trigger user;

drop table new_cars;
drop table job_cars;

-- ---------------------------------------------------------------------------
-- Backups: an admin's backup reads every table whole, private cars included
-- ---------------------------------------------------------------------------
create function public.backup_table(p_table text) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  if not (select app.is_admin()) then
    raise exception 'Only an admin can make a backup' using errcode = '42501';
  end if;
  if p_table is distinct from 'profiles' and not (p_table = any(app.backup_tables())) then
    raise exception 'Not a table in the backup: %', p_table;
  end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', p_table) into v_rows;
  return v_rows;
end;
$$;
revoke all on function public.backup_table(text) from public, anon;
grant execute on function public.backup_table(text) to authenticated;
