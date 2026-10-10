-- M2.1 · editable lists (categories, units, brands) and part number = unique item ID.
--
-- Lists: every member can ADD entries; only admins can rename or delete them.
-- Deleting an entry that is still used by an item is refused (foreign key).
-- Part numbers are generated in the app from category + brand codes (FLD-CAST-001), editable,
-- and unique (case-insensitive) in the database.

-- ---------------------------------------------------------------------------
-- Lists
-- ---------------------------------------------------------------------------
create table public.item_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40 and name = btrim(name)),
  code text not null check (code ~ '^[A-Z0-9]{2,5}$'),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
create unique index item_categories_name_key on public.item_categories (lower(name));
create unique index item_categories_code_key on public.item_categories (code);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 12 and name !~ '\s'),
  -- e.g. pieces: quantities must be whole numbers
  whole_only boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
create unique index units_name_key on public.units (lower(name));

-- brand names are case-sensitive on purpose: "BOSCH" and "Bosch" are different entries
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  code text not null check (code ~ '^[A-Z0-9]{2,6}$'),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
create unique index brands_name_key on public.brands (name);
create unique index brands_code_key on public.brands (code);

create trigger item_categories_audit before insert or update on public.item_categories
  for each row execute function app.stamp_audit();
create trigger units_audit before insert or update on public.units
  for each row execute function app.stamp_audit();
create trigger brands_audit before insert or update on public.brands
  for each row execute function app.stamp_audit();

-- keep today's categories and units
insert into public.item_categories (name, code, sort_order) values
  ('Part', 'PRT', 10),
  ('Consumable', 'CON', 20),
  ('Fluid', 'FLD', 30),
  ('Other', 'OTH', 40);

insert into public.units (name, whole_only, sort_order) values
  ('pcs', true, 10),
  ('L', false, 20),
  ('ml', false, 30),
  ('kg', false, 40),
  ('m', false, 50);

-- brands typed so far become list entries (code: first 4 letters, numbered on collisions)
with typed as (
  select distinct btrim(brand) as name from public.items where nullif(btrim(brand), '') is not null
), coded as (
  select name,
         rpad(left(upper(regexp_replace(translate(name, 'ČĆŠŽĐčćšžđ', 'CCSZDccszd'), '[^A-Za-z0-9]', '', 'g')), 4), 2, 'X') as base
  from typed
), numbered as (
  select name, base, row_number() over (partition by base order by name) as n from coded
)
insert into public.brands (name, code)
select name, case when n = 1 then base else left(base, 6 - char_length(n::text)) || n end
from numbered;

-- ---------------------------------------------------------------------------
-- Items: reference the lists; part number becomes the unique ID
-- ---------------------------------------------------------------------------
alter table public.items
  add column category_id uuid references public.item_categories (id),
  add column unit_id uuid references public.units (id),
  add column brand_id uuid references public.brands (id),
  -- the maker's own number (e.g. Bosch 0 986 494 123), for re-ordering; not unique
  add column manufacturer_ref text;

update public.items i set category_id = c.id
from public.item_categories c
where c.code = case i.category when 'part' then 'PRT' when 'consumable' then 'CON' when 'fluid' then 'FLD' else 'OTH' end;

update public.items i set unit_id = u.id from public.units u where u.name = i.unit::text;
update public.items i set brand_id = b.id from public.brands b where b.name = btrim(i.brand);

-- give every existing item an ID from its category and brand: CON-CAST-001
with x as (
  select i.id,
         c.code || coalesce('-' || b.code, '') as prefix,
         row_number() over (partition by c.code, b.code order by i.created_at, i.id) as n
  from public.items i
  join public.item_categories c on c.id = i.category_id
  left join public.brands b on b.id = i.brand_id
)
update public.items i set part_number = x.prefix || '-' || lpad(x.n::text, 3, '0')
from x where x.id = i.id;

alter table public.items
  alter column category_id set not null,
  alter column unit_id set not null,
  alter column part_number set not null,
  add constraint items_part_number_check check (char_length(part_number) between 1 and 40 and part_number = btrim(part_number));

create unique index items_part_number_key on public.items (upper(part_number));
create index items_category_idx on public.items (category_id);
create index items_unit_idx on public.items (unit_id);
create index items_brand_idx on public.items (brand_id);

-- the old enum columns go; functions that used the enum are recreated below
drop trigger items_guard_unit on public.items;
drop function app.items_guard_unit();
drop function app.fmt_qty(numeric, public.item_unit);
alter table public.items drop column category, drop column unit, drop column brand;
drop type public.item_category;
drop type public.item_unit;

create function app.fmt_qty(p_qty numeric, p_unit text) returns text
language sql
immutable
set search_path = ''
as $$
  select trim_scale(p_qty)::text || ' ' || p_unit;
$$;
revoke all on function app.fmt_qty(numeric, text) from public;

-- the unit means something once stock has moved
create function app.items_guard_unit() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.unit_id <> old.unit_id and exists (select 1 from public.stock_movements m where m.item_id = old.id) then
    raise exception 'The unit can''t be changed after stock has been recorded for this item';
  end if;
  return new;
end;
$$;

create trigger items_guard_unit before update of unit_id on public.items
  for each row execute function app.items_guard_unit();

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
grant insert (category_id, unit_id, brand_id, manufacturer_ref, part_number) on public.items to authenticated;
grant update (category_id, unit_id, brand_id, manufacturer_ref, part_number) on public.items to authenticated;

alter table public.item_categories enable row level security;
alter table public.units enable row level security;
alter table public.brands enable row level security;

revoke all on public.item_categories, public.units, public.brands from anon, authenticated;
grant all on public.item_categories, public.units, public.brands to service_role;
grant select, insert, update, delete on public.item_categories, public.units, public.brands to authenticated;

create policy "members read categories" on public.item_categories
  for select to authenticated using ((select app.is_member()));
create policy "members add categories" on public.item_categories
  for insert to authenticated with check ((select app.is_member()));
create policy "admins edit categories" on public.item_categories
  for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy "admins delete categories" on public.item_categories
  for delete to authenticated using ((select app.is_admin()));

create policy "members read units" on public.units
  for select to authenticated using ((select app.is_member()));
create policy "members add units" on public.units
  for insert to authenticated with check ((select app.is_member()));
create policy "admins edit units" on public.units
  for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy "admins delete units" on public.units
  for delete to authenticated using ((select app.is_admin()));

create policy "members read brands" on public.brands
  for select to authenticated using ((select app.is_member()));
create policy "members add brands" on public.brands
  for insert to authenticated with check ((select app.is_member()));
create policy "admins edit brands" on public.brands
  for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy "admins delete brands" on public.brands
  for delete to authenticated using ((select app.is_admin()));

-- ---------------------------------------------------------------------------
-- Stock functions: same behaviour, unit now comes from the units list (+ whole-number check)
-- ---------------------------------------------------------------------------
create or replace function public.post_stock_movement(
  p_item_id uuid,
  p_expected_version integer,
  p_type public.movement_type,
  p_qty_delta numeric,
  p_value_delta_cents bigint,
  p_occurred_on date default current_date,
  p_supplier text default null,
  p_reason text default null,
  p_note text default null,
  p_paid_by uuid default null,
  p_allocations jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.items%rowtype;
  v_unit text;
  v_whole boolean;
  v_new_qty numeric;
  v_new_value bigint;
  v_expected bigint;
  v_txn_id uuid;
  v_movement_id uuid;
  v_alloc_total bigint;
  v_external uuid;
  v_payer_ok boolean;
  v_summary text;
begin
  if not (select app.is_member()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_item from public.items where id = p_item_id for update;
  if not found then
    raise exception 'Item not found';
  end if;
  if v_item.version <> p_expected_version then
    -- HTTP 409 for PostgREST; the app re-reads the item and tries again
    raise exception 'The stock of % changed in the meantime', v_item.name using errcode = 'PT409';
  end if;
  if p_type in ('use_car', 'use_job', 'return') then
    raise exception 'Movement type % is not available yet', p_type;
  end if;
  if p_occurred_on is null or p_occurred_on > current_date + 1 then
    raise exception 'Choose a date that is not in the future';
  end if;

  select u.name, u.whole_only into v_unit, v_whole from public.units u where u.id = v_item.unit_id;
  if v_whole and p_qty_delta <> trunc(p_qty_delta) then
    raise exception 'Use whole % for %', v_unit, v_item.name;
  end if;

  v_new_qty := v_item.qty_on_hand + p_qty_delta;
  v_new_value := v_item.stock_value_cents + p_value_delta_cents;
  if v_new_qty < 0 then
    raise exception 'Only % of % in stock', app.fmt_qty(v_item.qty_on_hand, v_unit), v_item.name;
  end if;
  if v_new_value < 0 or (v_new_qty = 0 and v_new_value <> 0) then
    raise exception 'Stock value would become inconsistent';
  end if;

  -- outgoing stock always leaves at the current average cost (all of the value when it empties)
  if p_qty_delta < 0 then
    v_expected := case
      when v_new_qty = 0 then v_item.stock_value_cents
      else round(v_item.stock_value_cents * (-p_qty_delta) / v_item.qty_on_hand)::bigint
    end;
    if -p_value_delta_cents <> v_expected then
      raise exception 'Cost mismatch: expected %, got %', v_expected, -p_value_delta_cents;
    end if;
  elsif p_type = 'adjustment' and v_item.qty_on_hand > 0 then
    v_expected := round(v_item.stock_value_cents * p_qty_delta / v_item.qty_on_hand)::bigint;
    if p_value_delta_cents <> v_expected then
      raise exception 'Cost mismatch: expected %, got %', v_expected, p_value_delta_cents;
    end if;
  end if;

  if p_type = 'adjustment' and char_length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A stock correction needs a reason';
  end if;

  -- a purchase that cost money records who paid it
  if p_type = 'purchase' and p_value_delta_cents > 0 then
    select (a.kind = 'wallet' or (a.kind = 'partner' and p.is_active)) into v_payer_ok
    from public.accounts a
    left join public.profiles p on p.id = a.partner_id
    where a.id = p_paid_by;
    if not coalesce(v_payer_ok, false) then
      raise exception 'Choose who paid';
    end if;
    select a.id into v_external from public.accounts a where a.kind = 'external';
    insert into public.transactions
      (occurred_on, amount_cents, kind, category, from_account_id, to_account_id, description, counterparty)
    values
      (p_occurred_on, p_value_delta_cents, 'expense', 'stock_purchase', p_paid_by, v_external,
       app.fmt_qty(p_qty_delta, v_unit) || ' ' || v_item.name, nullif(btrim(p_supplier), ''))
    returning id into v_txn_id;
  end if;

  insert into public.stock_movements
    (item_id, type, occurred_on, qty_delta, value_delta_cents, supplier, reason, note, transaction_id)
  values
    (p_item_id, p_type, p_occurred_on, p_qty_delta, p_value_delta_cents,
     nullif(btrim(p_supplier), ''), nullif(btrim(p_reason), ''), nullif(btrim(p_note), ''), v_txn_id)
  returning id into v_movement_id;

  -- overhead and stock corrections change what the workshop owns: split by profit shares
  if p_type in ('overhead', 'adjustment') and p_value_delta_cents <> 0 then
    select coalesce(sum((a ->> 'amount_cents')::bigint), 0) into v_alloc_total
    from jsonb_array_elements(p_allocations) a;
    if v_alloc_total <> p_value_delta_cents then
      raise exception 'Profit shares don''t add up: % vs %', v_alloc_total, p_value_delta_cents;
    end if;
    insert into public.allocations (partner_id, amount_cents, occurred_on, stock_movement_id)
    select (a ->> 'partner_id')::uuid, (a ->> 'amount_cents')::bigint, p_occurred_on, v_movement_id
    from jsonb_array_elements(p_allocations) a
    where (a ->> 'amount_cents')::bigint <> 0;
  elsif jsonb_array_length(p_allocations) > 0 then
    raise exception 'This movement doesn''t take profit-share allocations';
  end if;

  update public.items
  set qty_on_hand = v_new_qty, stock_value_cents = v_new_value, version = version + 1
  where id = p_item_id;

  v_summary := case p_type
    when 'purchase' then format('Bought %s %s for %s', app.fmt_qty(p_qty_delta, v_unit), v_item.name,
                                app.fmt_eur(p_value_delta_cents))
    when 'overhead' then format('Used %s %s in the workshop', app.fmt_qty(-p_qty_delta, v_unit), v_item.name)
    else format('%s: %s%s %s', btrim(p_reason), case when p_qty_delta > 0 then '+' else '' end,
                app.fmt_qty(p_qty_delta, v_unit), v_item.name)
  end;
  perform app.log_activity('item', p_item_id, p_type::text, v_summary);

  return v_movement_id;
end;
$$;

create or replace function public.undo_stock_movement(p_movement_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.stock_movements%rowtype;
  v_item public.items%rowtype;
  v_unit text;
begin
  if not (select app.is_member()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_m from public.stock_movements where id = p_movement_id;
  if not found then
    raise exception 'Movement not found';
  end if;
  select * into v_item from public.items where id = v_m.item_id for update;
  select u.name into v_unit from public.units u where u.id = v_item.unit_id;

  if exists (select 1 from public.stock_movements m where m.item_id = v_m.item_id and m.seq > v_m.seq) then
    raise exception 'Only the latest movement of an item can be undone. Correct older ones with Adjust.';
  end if;
  if v_item.qty_on_hand - v_m.qty_delta < 0 or v_item.stock_value_cents - v_m.value_delta_cents < 0 then
    raise exception 'This movement can''t be undone';
  end if;

  delete from public.stock_movements where id = v_m.id; -- allocations go with it
  if v_m.transaction_id is not null then
    delete from public.transactions where id = v_m.transaction_id;
  end if;

  update public.items
  set qty_on_hand = qty_on_hand - v_m.qty_delta,
      stock_value_cents = stock_value_cents - v_m.value_delta_cents,
      version = version + 1
  where id = v_m.item_id;

  perform app.log_activity('item', v_m.item_id, 'undo',
    format('Undid %s of %s %s', replace(v_m.type::text, '_', ' '),
           app.fmt_qty(abs(v_m.qty_delta), v_unit), v_item.name));
end;
$$;
