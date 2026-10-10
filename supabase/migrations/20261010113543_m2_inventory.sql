-- M2 · inventory: items, stock movements at moving weighted average cost,
-- and the first money tables (purchases record who paid; overhead is split by profit shares).
--
-- The stock math lives in TypeScript (src/domain/stock.ts, unit-tested). The browser sends the computed
-- movement to public.post_stock_movement(), which locks the item, checks nobody changed it in the
-- meantime (version), re-checks the cost against the average and writes everything in one transaction.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.item_category as enum ('part', 'consumable', 'fluid', 'other');
create type public.item_unit as enum ('pcs', 'L', 'ml', 'kg', 'm');
create type public.movement_type as enum ('purchase', 'use_car', 'use_job', 'overhead', 'adjustment', 'return');
create type public.txn_kind as enum ('deposit', 'withdrawal', 'expense', 'income', 'transfer');

-- ---------------------------------------------------------------------------
-- Helpers for activity-log summaries
-- ---------------------------------------------------------------------------
create function app.fmt_eur(p_cents bigint) returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_cents < 0 then '-' else '' end
    || (abs(p_cents) / 100)::text || '.' || lpad((abs(p_cents) % 100)::text, 2, '0') || '€';
$$;

create function app.fmt_qty(p_qty numeric, p_unit public.item_unit) returns text
language sql
immutable
set search_path = ''
as $$
  select trim_scale(p_qty)::text || ' ' || p_unit::text;
$$;

create function app.log_activity(p_entity_type text, p_entity_id uuid, p_action text, p_summary text) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_log (actor_id, entity_type, entity_id, action, summary)
  values ((select auth.uid()), p_entity_type, p_entity_id, p_action, p_summary);
$$;

revoke all on function app.fmt_eur(bigint) from public;
revoke all on function app.fmt_qty(numeric, public.item_unit) from public;
revoke all on function app.log_activity(text, uuid, text, text) from public;

-- ---------------------------------------------------------------------------
-- Items
-- ---------------------------------------------------------------------------
create table public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  category public.item_category not null default 'part',
  brand text,
  part_number text,
  unit public.item_unit not null default 'pcs',
  min_qty numeric(12, 3) not null default 0 check (min_qty >= 0),
  location text,
  notes text,
  archived_at timestamptz,
  -- cached sums of the item's movements; only post/undo_stock_movement change them
  qty_on_hand numeric(12, 3) not null default 0 check (qty_on_hand >= 0),
  stock_value_cents bigint not null default 0 check (stock_value_cents >= 0),
  version integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint items_empty_has_no_value check (qty_on_hand > 0 or stock_value_cents = 0)
);

create index items_name_idx on public.items (lower(name));

create trigger items_audit before insert or update on public.items
  for each row execute function app.stamp_audit();

-- ---------------------------------------------------------------------------
-- Money: transactions (the ledger). Balances are always computed from these rows.
-- ---------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  occurred_on date not null default current_date,
  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null default 'EUR' check (currency = 'EUR'),
  kind public.txn_kind not null,
  category text not null check (category ~ '^[a-z_]+$'),
  from_account_id uuid not null references public.accounts (id),
  to_account_id uuid not null references public.accounts (id),
  description text,
  counterparty text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint transactions_two_accounts check (from_account_id <> to_account_id)
);

create index transactions_from_idx on public.transactions (from_account_id);
create index transactions_to_idx on public.transactions (to_account_id);
create index transactions_occurred_idx on public.transactions (occurred_on desc);

create trigger transactions_audit before insert or update on public.transactions
  for each row execute function app.stamp_audit();

-- deposit: partner → wallet · withdrawal: wallet → partner · expense: wallet/partner → external
-- income: external → wallet/partner · transfer: between the wallet and partners
create function app.check_transaction_accounts() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_from public.account_kind;
  v_to public.account_kind;
begin
  select a.kind into v_from from public.accounts a where a.id = new.from_account_id;
  select a.kind into v_to from public.accounts a where a.id = new.to_account_id;
  if not coalesce(case new.kind
      when 'deposit' then v_from = 'partner' and v_to = 'wallet'
      when 'withdrawal' then v_from = 'wallet' and v_to = 'partner'
      when 'expense' then v_from in ('wallet', 'partner') and v_to = 'external'
      when 'income' then v_from = 'external' and v_to in ('wallet', 'partner')
      when 'transfer' then v_from in ('wallet', 'partner') and v_to in ('wallet', 'partner')
    end, false) then
    raise exception 'A % can''t go from % to %', new.kind, v_from, v_to;
  end if;
  return new;
end;
$$;

create trigger transactions_check_accounts before insert or update on public.transactions
  for each row execute function app.check_transaction_accounts();

-- ---------------------------------------------------------------------------
-- Stock movements: the only way stock changes. Immutable; the latest one per item can be undone.
-- ---------------------------------------------------------------------------
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  item_id uuid not null references public.items (id),
  type public.movement_type not null,
  occurred_on date not null default current_date,
  qty_delta numeric(12, 3) not null check (qty_delta <> 0),
  value_delta_cents bigint not null,
  supplier text,
  reason text,
  note text,
  transaction_id uuid unique references public.transactions (id),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint stock_movements_direction check (
    (type = 'purchase' and qty_delta > 0 and value_delta_cents >= 0)
    or (type in ('use_car', 'use_job', 'overhead') and qty_delta < 0 and value_delta_cents <= 0)
    or (type = 'return' and qty_delta > 0 and value_delta_cents >= 0)
    or (type = 'adjustment' and sign(value_delta_cents) in (0, sign(qty_delta))
        and char_length(btrim(coalesce(reason, ''))) > 0)
  )
);

create index stock_movements_item_idx on public.stock_movements (item_id, seq desc);

create trigger stock_movements_audit before insert or update on public.stock_movements
  for each row execute function app.stamp_audit();

-- the unit means something once stock has moved
create function app.items_guard_unit() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.unit <> old.unit and exists (select 1 from public.stock_movements m where m.item_id = old.id) then
    raise exception 'The unit can''t be changed after stock has been recorded for this item';
  end if;
  return new;
end;
$$;

create trigger items_guard_unit before update of unit on public.items
  for each row execute function app.items_guard_unit();

-- ---------------------------------------------------------------------------
-- Allocations: non-cash entries that give partners their share of a profit or loss
-- (here: consumables used as overhead and stock-count corrections).
-- ---------------------------------------------------------------------------
create table public.allocations (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.profiles (id),
  amount_cents bigint not null check (amount_cents <> 0),
  occurred_on date not null,
  transaction_id uuid references public.transactions (id) on delete cascade,
  stock_movement_id uuid references public.stock_movements (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint allocations_one_source check (num_nonnulls(transaction_id, stock_movement_id) = 1)
);

create index allocations_partner_idx on public.allocations (partner_id);
create index allocations_movement_idx on public.allocations (stock_movement_id);
create index allocations_transaction_idx on public.allocations (transaction_id);

create trigger allocations_audit before insert or update on public.allocations
  for each row execute function app.stamp_audit();

-- ---------------------------------------------------------------------------
-- Last purchase per item (shopping list: where and for how much we bought it last time)
-- ---------------------------------------------------------------------------
create view public.item_last_purchases with (security_invoker = true) as
select distinct on (m.item_id)
  m.item_id,
  m.occurred_on,
  m.supplier,
  m.qty_delta as qty,
  m.value_delta_cents as total_cents
from public.stock_movements m
where m.type = 'purchase'
order by m.item_id, m.seq desc;

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
alter table public.items enable row level security;
alter table public.transactions enable row level security;
alter table public.stock_movements enable row level security;
alter table public.allocations enable row level security;

revoke all on public.items, public.transactions, public.stock_movements, public.allocations,
  public.item_last_purchases from anon, authenticated;
grant all on public.items, public.transactions, public.stock_movements, public.allocations,
  public.item_last_purchases to service_role;

grant select on public.items, public.transactions, public.stock_movements, public.allocations,
  public.item_last_purchases to authenticated;
-- members create and edit item details; quantities and values only change through stock movements
grant insert (id, name, category, brand, part_number, unit, min_qty, location, notes) on public.items to authenticated;
grant update (name, category, brand, part_number, unit, min_qty, location, notes, archived_at) on public.items to authenticated;
grant delete on public.items to authenticated;

create policy "members read items" on public.items
  for select to authenticated using ((select app.is_member()));
create policy "members add items" on public.items
  for insert to authenticated with check ((select app.is_member()));
create policy "members edit items" on public.items
  for update to authenticated using ((select app.is_member())) with check ((select app.is_member()));
-- deleting only works while the item has no movements (foreign key); otherwise archive it
create policy "members delete items" on public.items
  for delete to authenticated using ((select app.is_member()));

create policy "members read transactions" on public.transactions
  for select to authenticated using ((select app.is_member()));
create policy "members read stock movements" on public.stock_movements
  for select to authenticated using ((select app.is_member()));
create policy "members read allocations" on public.allocations
  for select to authenticated using ((select app.is_member()));

-- ---------------------------------------------------------------------------
-- post_stock_movement: the one way to change stock
-- ---------------------------------------------------------------------------
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
  p_allocations jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.items%rowtype;
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

  v_new_qty := v_item.qty_on_hand + p_qty_delta;
  v_new_value := v_item.stock_value_cents + p_value_delta_cents;
  if v_new_qty < 0 then
    raise exception 'Only % of % in stock', app.fmt_qty(v_item.qty_on_hand, v_item.unit), v_item.name;
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
       app.fmt_qty(p_qty_delta, v_item.unit) || ' ' || v_item.name, nullif(btrim(p_supplier), ''))
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
    when 'purchase' then format('Bought %s %s for %s', app.fmt_qty(p_qty_delta, v_item.unit), v_item.name,
                                app.fmt_eur(p_value_delta_cents))
    when 'overhead' then format('Used %s %s in the workshop', app.fmt_qty(-p_qty_delta, v_item.unit), v_item.name)
    else format('Corrected %s by %s%s (%s)', v_item.name, case when p_qty_delta > 0 then '+' else '' end,
                app.fmt_qty(p_qty_delta, v_item.unit), btrim(p_reason))
  end;
  perform app.log_activity('item', p_item_id, p_type::text, v_summary);

  return v_movement_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- undo_stock_movement: removes the item's LATEST movement (and its payment / allocations),
-- which restores the exact previous stock. Older mistakes are fixed with a stock correction.
-- ---------------------------------------------------------------------------
create function public.undo_stock_movement(p_movement_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.stock_movements%rowtype;
  v_item public.items%rowtype;
begin
  if not (select app.is_member()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into v_m from public.stock_movements where id = p_movement_id;
  if not found then
    raise exception 'Movement not found';
  end if;
  select * into v_item from public.items where id = v_m.item_id for update;

  if exists (select 1 from public.stock_movements m where m.item_id = v_m.item_id and m.seq > v_m.seq) then
    raise exception 'Only the latest movement of an item can be undone. Correct older ones with a stock count.';
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
           app.fmt_qty(abs(v_m.qty_delta), v_item.unit), v_item.name));
end;
$$;

revoke all on function public.post_stock_movement(uuid, integer, public.movement_type, numeric, bigint, date, text, text, text, uuid, jsonb) from public, anon;
revoke all on function public.undo_stock_movement(uuid) from public, anon;
grant execute on function public.post_stock_movement(uuid, integer, public.movement_type, numeric, bigint, date, text, text, text, uuid, jsonb) to authenticated;
grant execute on function public.undo_stock_movement(uuid) to authenticated;
