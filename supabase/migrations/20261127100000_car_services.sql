-- R6 · V2: service history, parts on our own cars, workshop stock on a member's car (docs/PLAN.md §13).
--
--   car_services   a service on any car: date, mileage, type, what was done, where (us / another garage)
--                  · workshop car: its price is the costs filed under it (transactions / stock_movements.service_id)
--                  · member's car: the parts bought for it (car_parts.service_id) + workshop stock + the work price
--                  · customer's car: its jobs are its services; one done elsewhere has a work price
--   car_parts      parts bought for a member's own car (tyres, battery …), with details per kind of part
--   stock on a member's car is charged to the owner at cost (an allocation), returning it pays it back

-- ---------------------------------------------------------------------------
-- Service types: a structural list (added on the Lists page; admins rename and delete)
-- ---------------------------------------------------------------------------
create table public.service_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
create unique index service_types_name_key on public.service_types (lower(name));

create trigger service_types_audit before insert or update on public.service_types
  for each row execute function app.stamp_audit();

insert into public.service_types (name, sort_order) values
  ('Small service', 10),
  ('Big service', 20),
  ('Timing belt', 30),
  ('Tyres', 40),
  ('Brakes', 50),
  ('Technical inspection', 60),
  ('Repair', 70),
  ('Other', 90);

-- ---------------------------------------------------------------------------
-- Services
-- ---------------------------------------------------------------------------
create table public.car_services (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars (id) on delete cascade,
  performed_on date not null default current_date,
  mileage_km integer check (mileage_km >= 0),
  service_type_id uuid references public.service_types (id),
  description text check (description is null or char_length(description) <= 2000),
  -- null: done by us
  garage text check (garage is null or (char_length(garage) between 1 and 80 and garage = btrim(garage))),
  -- the work (members' and customers' cars only; on the workshop's cars the price is the costs filed under it)
  labor_cents bigint check (labor_cents >= 0),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint car_services_what check (service_type_id is not null or char_length(btrim(coalesce(description, ''))) > 0)
);
create index car_services_car_idx on public.car_services (car_id, performed_on desc);

create trigger car_services_audit before insert or update on public.car_services
  for each row execute function app.stamp_audit();

create function app.car_services_rules() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.car_id is distinct from old.car_id then
    raise exception 'A service stays on its car' using errcode = '23514';
  end if;
  if new.labor_cents is not null and exists (select 1 from public.cars c where c.id = new.car_id and c.owner_kind = 'workshop') then
    raise exception 'On the workshop''s cars a service costs what is filed under it' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger car_services_rules before insert or update on public.car_services
  for each row execute function app.car_services_rules();

-- ---------------------------------------------------------------------------
-- Parts on members' own cars
-- ---------------------------------------------------------------------------
create table public.car_parts (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars (id) on delete cascade,
  service_id uuid references public.car_services (id) on delete set null,
  -- src/domain/carParts.ts lists the kinds and their extra fields (kept in details)
  kind text not null default 'other' check (kind in (
    'tyres', 'wheels', 'battery', 'oil', 'filter', 'brakes', 'wipers', 'bulbs', 'suspension', 'timing', 'plugs', 'coolant', 'other'
  )),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  brand_id uuid references public.brands (id),
  part_number text check (part_number is null or char_length(part_number) <= 60),
  bought_on date,
  bought_from text check (bought_from is null or char_length(bought_from) <= 120),
  price_cents bigint check (price_cents >= 0),
  fitted_km integer check (fitted_km >= 0),
  state text not null default 'fitted' check (state in ('fitted', 'stored', 'gone')),
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
create index car_parts_car_idx on public.car_parts (car_id);
create index car_parts_service_idx on public.car_parts (service_id);
create index car_parts_brand_idx on public.car_parts (brand_id);

create trigger car_parts_audit before insert or update on public.car_parts
  for each row execute function app.stamp_audit();

create function app.car_parts_rules() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.car_id is distinct from old.car_id then
    raise exception 'A part stays on its car' using errcode = '23514';
  end if;
  if not exists (select 1 from public.cars c where c.id = new.car_id and c.owner_kind = 'member') then
    raise exception 'Parts are kept on our own cars (on the workshop''s cars they are costs, on customers'' cars job lines)'
      using errcode = '23514';
  end if;
  if new.service_id is not null and not exists (select 1 from public.car_services s where s.id = new.service_id and s.car_id = new.car_id) then
    raise exception 'The service belongs to another car' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger car_parts_rules before insert or update on public.car_parts
  for each row execute function app.car_parts_rules();

-- ---------------------------------------------------------------------------
-- Costs filed under a service
-- ---------------------------------------------------------------------------
alter table public.transactions add column service_id uuid references public.car_services (id) on delete set null;
alter table public.stock_movements add column service_id uuid references public.car_services (id) on delete set null;
create index transactions_service_idx on public.transactions (service_id);
create index stock_movements_service_idx on public.stock_movements (service_id);

grant insert (service_id) on public.transactions to authenticated;
grant update (service_id) on public.transactions to authenticated;

create function app.cost_in_its_cars_service() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.service_id is not null
     and not exists (select 1 from public.car_services s where s.id = new.service_id and s.car_id = new.car_id) then
    raise exception 'The service belongs to another car' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger transactions_service before insert or update of service_id, car_id on public.transactions
  for each row execute function app.cost_in_its_cars_service();
create trigger stock_movements_service before insert or update of service_id on public.stock_movements
  for each row execute function app.cost_in_its_cars_service();

-- Stock movements are written only by functions: this one files one under a service (or takes it out)
create function public.set_movement_service(p_movement_id uuid, p_service_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_car uuid;
begin
  if not (select app.is_member()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select m.car_id into v_car from public.stock_movements m where m.id = p_movement_id;
  if v_car is null or not app.car_visible(v_car) then
    raise exception 'Parts used on a car not found';
  end if;
  if not app.car_open(v_car) then
    raise exception 'This car is settled; its costs can''t be changed anymore';
  end if;
  update public.stock_movements set service_id = p_service_id where id = p_movement_id;
end;
$$;
revoke all on function public.set_movement_service(uuid, uuid) from public, anon;
grant execute on function public.set_movement_service(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Workshop stock on a member's car: allowed, and charged to the owner at cost
-- ---------------------------------------------------------------------------
drop trigger stock_movements_workshop_cars on public.stock_movements;

create function app.stock_not_on_customers_cars() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.car_id is not null and exists (select 1 from public.cars c where c.id = new.car_id and c.owner_kind = 'customer') then
    raise exception 'Parts for a customer''s car go on a job' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger stock_movements_own_cars before insert on public.stock_movements
  for each row execute function app.stock_not_on_customers_cars();

-- the owner's share of the workshop goes down by what they took (and up again for what comes back)
create function app.charge_member_stock() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if new.car_id is null or new.value_delta_cents = 0 then
    return null;
  end if;
  select c.owner_member_id into v_owner from public.cars c where c.id = new.car_id and c.owner_kind = 'member';
  if v_owner is not null then
    insert into public.allocations (partner_id, amount_cents, occurred_on, stock_movement_id)
    values (v_owner, new.value_delta_cents, new.occurred_on, new.id);
  end if;
  return null;
end;
$$;

create trigger stock_movements_charge_member after insert on public.stock_movements
  for each row execute function app.charge_member_stock();

-- money and parts taken from stock tie a car to its owner
create or replace function app.cars_owner_rules() returns trigger
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
    if (new.owner_kind is distinct from old.owner_kind or new.owner_member_id is distinct from old.owner_member_id)
       and (exists (select 1 from public.transactions t where t.car_id = new.id)
            or exists (select 1 from public.stock_movements m where m.car_id = new.id)) then
      raise exception 'This car has money entries or parts from stock, so its owner can''t change' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- the stock's activity line names a private car only as "a private car"
create function app.private_car_in_activity() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text;
begin
  if new.entity_type = 'item' and new.action in ('use_car', 'return') then
    select c.ref into v_ref
    from public.stock_movements m
    join public.cars c on c.id = m.car_id
    where m.item_id = new.entity_id and c.is_private
      and m.seq = (select max(m2.seq) from public.stock_movements m2 where m2.item_id = new.entity_id);
    if v_ref is not null then
      new.summary := replace(new.summary, v_ref, 'a private car');
    end if;
  end if;
  return new;
end;
$$;

create trigger activity_log_private_cars before insert on public.activity_log
  for each row execute function app.private_car_in_activity();

-- ---------------------------------------------------------------------------
-- Activity: services and parts are logged on their car (so a private car's stay private)
-- ---------------------------------------------------------------------------
create function app.log_car_service_activity() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text;
  v_what text;
begin
  select c.ref into v_ref from public.cars c where c.id = new.car_id;
  if tg_table_name = 'car_services' then
    select t.name into v_what from public.service_types t where t.id = new.service_type_id;
    perform app.log_activity('car', new.car_id, 'service',
      format('%s: %s on %s', v_ref, coalesce(v_what, left(new.description, 60)), to_char(new.performed_on, 'DD.MM.YYYY')));
  else
    perform app.log_activity('car', new.car_id, 'part', format('%s: %s', v_ref, new.name));
  end if;
  return null;
end;
$$;

create trigger car_services_activity after insert on public.car_services
  for each row execute function app.log_car_service_activity();
create trigger car_parts_activity after insert on public.car_parts
  for each row execute function app.log_car_service_activity();

-- ---------------------------------------------------------------------------
-- Receipts and photos of services and parts; a private car's stay with its owner
-- ---------------------------------------------------------------------------
alter table public.attachments
  drop constraint attachments_entity_type_check,
  add constraint attachments_entity_type_check
    check (entity_type in ('car', 'job', 'stock_movement', 'transaction', 'tool', 'item', 'website', 'car_service', 'car_part'));

create function app.attachment_visible(p_entity_type text, p_entity_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_entity_type
    when 'car' then app.car_visible(p_entity_id)
    when 'car_service' then app.car_visible((select s.car_id from public.car_services s where s.id = p_entity_id))
    when 'car_part' then app.car_visible((select p.car_id from public.car_parts p where p.id = p_entity_id))
    else true
  end;
$$;
revoke all on function app.attachment_visible(text, uuid) from public;
grant execute on function app.attachment_visible(text, uuid) to authenticated, service_role;

drop policy "private cars' files" on public.attachments;
create policy "private cars' files" on public.attachments
  as restrictive for all to authenticated
  using (app.attachment_visible(entity_type, entity_id))
  with check (app.attachment_visible(entity_type, entity_id));

-- ---------------------------------------------------------------------------
-- Suppliers: where a car's part was bought joins the list too
-- ---------------------------------------------------------------------------
create or replace function app.remember_supplier() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  -- separate branches: each table's row only has its own columns
  if tg_table_name = 'transactions' then
    if app.is_supplier_purchase(new.category) then
      v_name := new.counterparty;
    end if;
  elsif tg_table_name = 'stock_movements' then
    v_name := new.supplier;
  elsif tg_table_name in ('tools', 'car_parts') then
    v_name := new.bought_from;
  end if;
  v_name := btrim(coalesce(v_name, ''));
  if char_length(v_name) between 1 and 120 then
    insert into public.suppliers (name) values (v_name) on conflict (name) do nothing;
  end if;
  return null;
end;
$$;

create trigger car_parts_remember_supplier after insert or update of bought_from on public.car_parts
  for each row execute function app.remember_supplier();

create or replace view public.supplier_usage with (security_invoker = true) as
select s.id, s.name, count(u.name)::integer as uses
from public.suppliers s
left join (
  select counterparty as name from public.transactions where app.is_supplier_purchase(category)
  union all
  select bought_from from public.tools
  union all
  select bought_from from public.car_parts
) u on u.name = s.name
group by s.id, s.name;

create or replace function public.rename_supplier(p_id uuid, p_name text) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
  v_new text := btrim(coalesce(p_name, ''));
begin
  if not (select app.is_admin()) then
    raise exception 'Only an admin can rename suppliers' using errcode = '42501';
  end if;
  if char_length(v_new) not between 1 and 120 then
    raise exception 'Enter a name (up to 120 characters)';
  end if;
  select s.name into v_old from public.suppliers s where s.id = p_id for update;
  if not found then
    raise exception 'Supplier not found';
  end if;
  if v_old = v_new then
    return;
  end if;

  -- plain rename: the entry takes the new name (merging: the entry with that name stays)
  if not exists (select 1 from public.suppliers s where s.name = v_new) then
    update public.suppliers set name = v_new where id = p_id;
  end if;
  update public.transactions set counterparty = v_new
    where app.is_supplier_purchase(category) and counterparty = v_old;
  update public.stock_movements set supplier = v_new where supplier = v_old;
  update public.tools set bought_from = v_new where bought_from = v_old;
  update public.car_parts set bought_from = v_new where bought_from = v_old;
  -- merging: the old entry is unused now, so it can go
  delete from public.suppliers where id = p_id and name = v_old;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges + RLS: services and parts follow their car's privacy
-- ---------------------------------------------------------------------------
alter table public.service_types enable row level security;
alter table public.car_services enable row level security;
alter table public.car_parts enable row level security;

revoke all on public.service_types, public.car_services, public.car_parts from anon, authenticated;
grant all on public.service_types, public.car_services, public.car_parts to service_role;
grant select, insert, update, delete on public.service_types, public.car_services, public.car_parts to authenticated;

create policy "members read service types" on public.service_types
  for select to authenticated using ((select app.is_member()));
create policy "members add service types" on public.service_types
  for insert to authenticated with check ((select app.is_member()));
create policy "admins edit service types" on public.service_types
  for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
-- only while unused (foreign keys)
create policy "admins delete service types" on public.service_types
  for delete to authenticated using ((select app.is_admin()));

create policy "members read services" on public.car_services
  for select to authenticated using ((select app.is_member()) and app.car_visible(car_id));
create policy "members add services" on public.car_services
  for insert to authenticated with check ((select app.is_member()) and app.car_visible(car_id));
create policy "members edit services" on public.car_services
  for update to authenticated using ((select app.is_member()) and app.car_visible(car_id))
  with check ((select app.is_member()) and app.car_visible(car_id));
create policy "members delete services" on public.car_services
  for delete to authenticated using ((select app.is_member()) and app.car_visible(car_id));

create policy "members read car parts" on public.car_parts
  for select to authenticated using ((select app.is_member()) and app.car_visible(car_id));
create policy "members add car parts" on public.car_parts
  for insert to authenticated with check ((select app.is_member()) and app.car_visible(car_id));
create policy "members edit car parts" on public.car_parts
  for update to authenticated using ((select app.is_member()) and app.car_visible(car_id))
  with check ((select app.is_member()) and app.car_visible(car_id));
create policy "members delete car parts" on public.car_parts
  for delete to authenticated using ((select app.is_member()) and app.car_visible(car_id));
