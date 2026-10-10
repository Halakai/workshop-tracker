-- M3 · cars (flips) and their costs.
--
-- Money on a car never lives on the car row. It comes from:
--   transactions with car_id:  car_purchase · car_part (bought for this car) · car_cost (other costs) · car_sale
--   stock_movements with car_id: use_car (parts from stock) · return (unused parts back to stock)
-- Car totals are computed in TypeScript (src/domain/cars.ts) from the car_summaries view.

-- ---------------------------------------------------------------------------
-- Contacts: sellers and buyers now, customers later. Members add and edit, admins delete.
-- ---------------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80 and name = btrim(name)),
  phone text check (phone is null or char_length(phone) <= 40),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
create unique index contacts_name_key on public.contacts (lower(name));

create trigger contacts_audit before insert or update on public.contacts
  for each row execute function app.stamp_audit();

-- ---------------------------------------------------------------------------
-- Expense categories (other costs on a car; later also workshop expenses).
-- A structural list: added on the lists page; admins rename/delete.
-- ---------------------------------------------------------------------------
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
create unique index expense_categories_name_key on public.expense_categories (lower(name));

create trigger expense_categories_audit before insert or update on public.expense_categories
  for each row execute function app.stamp_audit();

insert into public.expense_categories (name, sort_order) values
  ('Registration / transfer', 10),
  ('Technical inspection', 20),
  ('Transport / towing', 30),
  ('Ads', 40),
  ('Insurance', 50),
  ('Other', 90);

-- ---------------------------------------------------------------------------
-- Cars
-- ---------------------------------------------------------------------------
create type public.car_status as enum ('bought', 'in_repair', 'ready', 'listed', 'sold', 'scrapped');

create table public.cars (
  id uuid primary key default gen_random_uuid(),
  -- our own short ID, generated in the app (CAR-001), editable, unique ignoring case
  ref text not null check (char_length(ref) between 1 and 20 and ref = btrim(ref)),
  make text not null check (char_length(btrim(make)) between 1 and 40),
  model text not null check (char_length(btrim(model)) between 1 and 60),
  year integer check (year between 1900 and 2100),
  vin text check (vin is null or char_length(vin) <= 20),
  plate text check (plate is null or char_length(plate) <= 15),
  engine text,
  fuel text,
  mileage_km integer check (mileage_km >= 0),
  colour text,
  notes text,
  status public.car_status not null default 'bought',
  status_changed_at timestamptz not null default now(),
  purchase_date date not null default current_date,
  seller_id uuid references public.contacts (id),
  asking_price_cents bigint check (asking_price_cents >= 0),
  listing_url text,
  sale_date date,
  buyer_id uuid references public.contacts (id),
  sale_mileage_km integer check (sale_mileage_km >= 0),
  -- set when the car is settled up (M4); its money is frozen from then on
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
create unique index cars_ref_key on public.cars (upper(ref));
create index cars_status_idx on public.cars (status);
create index cars_seller_idx on public.cars (seller_id);
create index cars_buyer_idx on public.cars (buyer_id);

create trigger cars_audit before insert or update on public.cars
  for each row execute function app.stamp_audit();

create function app.cars_status_changed() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger cars_status_changed before update of status on public.cars
  for each row execute function app.cars_status_changed();

-- Profit shares per car: copied from the partners' default shares when the car is added.
create table public.car_shares (
  car_id uuid not null references public.cars (id) on delete cascade,
  partner_id uuid not null references public.profiles (id),
  share_bp integer not null check (share_bp between 0 and 10000),
  primary key (car_id, partner_id)
);

create function app.cars_default_shares() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.car_shares (car_id, partner_id, share_bp)
  select new.id, p.id, p.default_share_bp
  from public.profiles p
  where p.is_active and p.default_share_bp > 0;
  return new;
end;
$$;

create trigger cars_default_shares after insert on public.cars
  for each row execute function app.cars_default_shares();

-- ---------------------------------------------------------------------------
-- Money and stock linked to cars
-- ---------------------------------------------------------------------------
alter table public.transactions
  add column car_id uuid references public.cars (id),
  add column expense_category_id uuid references public.expense_categories (id),
  add constraint transactions_car_rules check (
    (category not in ('car_purchase', 'car_part', 'car_cost', 'car_sale') or car_id is not null)
    and (category <> 'car_cost' or expense_category_id is not null)
    and (category not in ('car_purchase', 'car_part', 'car_cost') or kind = 'expense')
    and (category <> 'car_sale' or kind = 'income')
  );
create index transactions_car_idx on public.transactions (car_id);
-- one purchase per car
create unique index transactions_one_purchase_per_car on public.transactions (car_id) where category = 'car_purchase';

alter table public.stock_movements
  add column car_id uuid references public.cars (id),
  add constraint stock_movements_target check (
    case type
      when 'use_car' then car_id is not null
      when 'return' then car_id is not null
      else car_id is null
    end
  );
create index stock_movements_car_idx on public.stock_movements (car_id);

-- ---------------------------------------------------------------------------
-- Car totals per car (the TypeScript side computes invested / profit / margin)
-- ---------------------------------------------------------------------------
create view public.car_summaries with (security_invoker = true) as
select
  c.id as car_id,
  coalesce(t.purchase_cents, 0)::bigint as purchase_cents,
  coalesce(s.stock_cents, 0)::bigint as stock_cents,
  coalesce(t.parts_cents, 0)::bigint as parts_cents,
  coalesce(t.other_costs_cents, 0)::bigint as other_costs_cents,
  coalesce(t.sale_cents, 0)::bigint as sale_cents,
  coalesce(t.sale_count, 0)::integer as sale_count
from public.cars c
left join (
  select car_id,
         sum(amount_cents) filter (where category = 'car_purchase') as purchase_cents,
         sum(amount_cents) filter (where category = 'car_part') as parts_cents,
         sum(amount_cents) filter (where category = 'car_cost') as other_costs_cents,
         sum(amount_cents) filter (where category = 'car_sale') as sale_cents,
         count(*) filter (where category = 'car_sale') as sale_count
  from public.transactions
  where car_id is not null
  group by car_id
) t on t.car_id = c.id
left join (
  -- parts used minus parts returned (use_car values are negative)
  select car_id, -sum(value_delta_cents) as stock_cents
  from public.stock_movements
  where car_id is not null
  group by car_id
) s on s.car_id = c.id;

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
alter table public.contacts enable row level security;
alter table public.expense_categories enable row level security;
alter table public.cars enable row level security;
alter table public.car_shares enable row level security;

revoke all on public.contacts, public.expense_categories, public.cars, public.car_shares, public.car_summaries
  from anon, authenticated;
grant all on public.contacts, public.expense_categories, public.cars, public.car_shares, public.car_summaries
  to service_role;

grant select, insert, update, delete on public.contacts, public.expense_categories, public.cars to authenticated;
grant select on public.car_shares, public.car_summaries to authenticated;

create policy "members read contacts" on public.contacts
  for select to authenticated using ((select app.is_member()));
create policy "members add contacts" on public.contacts
  for insert to authenticated with check ((select app.is_member()));
create policy "members edit contacts" on public.contacts
  for update to authenticated using ((select app.is_member())) with check ((select app.is_member()));
create policy "admins delete contacts" on public.contacts
  for delete to authenticated using ((select app.is_admin()));

create policy "members read expense categories" on public.expense_categories
  for select to authenticated using ((select app.is_member()));
create policy "members add expense categories" on public.expense_categories
  for insert to authenticated with check ((select app.is_member()));
create policy "admins edit expense categories" on public.expense_categories
  for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy "admins delete expense categories" on public.expense_categories
  for delete to authenticated using ((select app.is_admin()));

create policy "members read cars" on public.cars
  for select to authenticated using ((select app.is_member()));
create policy "members add cars" on public.cars
  for insert to authenticated with check ((select app.is_member()) and settled_at is null);
create policy "members edit unsettled cars" on public.cars
  for update to authenticated using ((select app.is_member()) and settled_at is null)
  with check ((select app.is_member()) and settled_at is null);
-- only works while nothing is attached to the car (foreign keys)
create policy "members delete unsettled cars" on public.cars
  for delete to authenticated using ((select app.is_member()) and settled_at is null);

create policy "members read car shares" on public.car_shares
  for select to authenticated using ((select app.is_member()));

-- Car money can be written directly by members, while the car isn't settled.
-- Stock purchases stay function-only (post_stock_movement).
grant insert (id, occurred_on, amount_cents, kind, category, from_account_id, to_account_id, description,
              counterparty, car_id, expense_category_id)
  on public.transactions to authenticated;
grant update (occurred_on, amount_cents, from_account_id, to_account_id, description, counterparty,
              expense_category_id)
  on public.transactions to authenticated;
grant delete on public.transactions to authenticated;

create function app.car_open(p_car_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.cars c where c.id = p_car_id and c.settled_at is null);
$$;
revoke all on function app.car_open(uuid) from public;
grant execute on function app.car_open(uuid) to authenticated, service_role;

create policy "members add car money" on public.transactions
  for insert to authenticated
  with check (
    (select app.is_member())
    and category in ('car_purchase', 'car_part', 'car_cost', 'car_sale')
    and app.car_open(car_id)
  );
create policy "members edit car money" on public.transactions
  for update to authenticated
  using ((select app.is_member()) and category in ('car_purchase', 'car_part', 'car_cost', 'car_sale') and app.car_open(car_id))
  with check ((select app.is_member()) and app.car_open(car_id));
create policy "members delete car money" on public.transactions
  for delete to authenticated
  using ((select app.is_member()) and category in ('car_purchase', 'car_part', 'car_cost', 'car_sale') and app.car_open(car_id));

-- ---------------------------------------------------------------------------
-- post_stock_movement: + use on a car and return to stock from a car
-- (new parameter p_car_id, so the old signature is replaced)
-- ---------------------------------------------------------------------------
drop function public.post_stock_movement(uuid, integer, public.movement_type, numeric, bigint, date, text, text, text, uuid, jsonb);

create function public.post_stock_movement(
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
  p_allocations jsonb default '[]'::jsonb,
  p_car_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.items%rowtype;
  v_car public.cars%rowtype;
  v_unit text;
  v_whole boolean;
  v_new_qty numeric;
  v_new_value bigint;
  v_expected bigint;
  v_used_qty numeric;
  v_used_value bigint;
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
  if p_type = 'use_job' then
    raise exception 'Movement type % is not available yet', p_type;
  end if;
  if p_occurred_on is null or p_occurred_on > current_date + 1 then
    raise exception 'Choose a date that is not in the future';
  end if;

  if p_type in ('use_car', 'return') then
    select * into v_car from public.cars where id = p_car_id;
    if not found then
      raise exception 'Choose a car';
    end if;
    if v_car.settled_at is not null then
      raise exception 'Car % is already settled', v_car.ref;
    end if;
  elsif p_car_id is not null then
    raise exception 'Only use and return movements belong to a car';
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
  elsif p_type = 'return' then
    -- parts come back at exactly what this car was charged for them
    select coalesce(-sum(m.qty_delta), 0), coalesce(-sum(m.value_delta_cents), 0)
    into v_used_qty, v_used_value
    from public.stock_movements m
    where m.item_id = p_item_id and m.car_id = p_car_id;
    if p_qty_delta > v_used_qty then
      raise exception 'Only % of % is on car %', app.fmt_qty(v_used_qty, v_unit), v_item.name, v_car.ref;
    end if;
    v_expected := case
      when p_qty_delta = v_used_qty then v_used_value
      else round(v_used_value * p_qty_delta / v_used_qty)::bigint
    end;
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
    (item_id, type, occurred_on, qty_delta, value_delta_cents, supplier, reason, note, transaction_id, car_id)
  values
    (p_item_id, p_type, p_occurred_on, p_qty_delta, p_value_delta_cents,
     nullif(btrim(p_supplier), ''), nullif(btrim(p_reason), ''), nullif(btrim(p_note), ''), v_txn_id, p_car_id)
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
    when 'use_car' then format('Used %s %s on %s', app.fmt_qty(-p_qty_delta, v_unit), v_item.name, v_car.ref)
    when 'return' then format('Returned %s %s from %s to stock', app.fmt_qty(p_qty_delta, v_unit), v_item.name, v_car.ref)
    else format('%s: %s%s %s', btrim(p_reason), case when p_qty_delta > 0 then '+' else '' end,
                app.fmt_qty(p_qty_delta, v_unit), v_item.name)
  end;
  perform app.log_activity('item', p_item_id, p_type::text, v_summary);

  return v_movement_id;
end;
$$;

revoke all on function public.post_stock_movement(uuid, integer, public.movement_type, numeric, bigint, date, text, text, text, uuid, jsonb, uuid) from public, anon;
grant execute on function public.post_stock_movement(uuid, integer, public.movement_type, numeric, bigint, date, text, text, text, uuid, jsonb, uuid) to authenticated;

-- undo: also refuse when the movement belongs to a settled car
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
  if v_m.car_id is not null and not app.car_open(v_m.car_id) then
    raise exception 'That car is already settled';
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
