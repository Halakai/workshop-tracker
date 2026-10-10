-- M5 · small jobs for friends (customer jobs) and invoices.
--
-- A job's money:
--   job_lines: what the customer is charged (sale price per line) — from stock, bought for the job, or other
--   jobs.labor_price_cents: fixed labor price
--   stock_movements use_job / return  → cost of parts from stock
--   transactions job_part (expense)   → cost of parts bought for the job (linked to its line)
--   transactions job_payment (income) → what the customer paid, and who received it
-- Profit when settling = payments − costs. Invoices get gapless numbers per year (2026-001).

create type public.job_status as enum ('open', 'done', 'paid');

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  ref text not null check (char_length(ref) between 1 and 20 and ref = btrim(ref)),
  customer_id uuid not null references public.contacts (id),
  car_make text check (car_make is null or char_length(car_make) <= 40),
  car_model text check (car_model is null or char_length(car_model) <= 60),
  car_plate text check (car_plate is null or char_length(car_plate) <= 15),
  car_vin text check (car_vin is null or char_length(car_vin) <= 20),
  description text not null check (char_length(btrim(description)) between 1 and 2000),
  status public.job_status not null default 'open',
  labor_price_cents bigint not null default 0 check (labor_price_cents >= 0),
  done_on date,
  invoice_number text unique,
  invoice_date date,
  notes text,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
create unique index jobs_ref_key on public.jobs (upper(ref));
create index jobs_customer_idx on public.jobs (customer_id);
create index jobs_status_idx on public.jobs (status);

create trigger jobs_audit before insert or update on public.jobs
  for each row execute function app.stamp_audit();

create table public.job_shares (
  job_id uuid not null references public.jobs (id) on delete cascade,
  partner_id uuid not null references public.profiles (id),
  share_bp integer not null check (share_bp between 0 and 10000),
  primary key (job_id, partner_id)
);

create function app.jobs_default_shares() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.job_shares (job_id, partner_id, share_bp)
  select new.id, p.id, p.default_share_bp
  from public.profiles p
  where p.is_active and p.default_share_bp > 0;
  return new;
end;
$$;

create trigger jobs_default_shares after insert on public.jobs
  for each row execute function app.jobs_default_shares();

create function app.job_open(p_job_id uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.jobs j where j.id = p_job_id and j.settled_at is null);
$$;
revoke all on function app.job_open(uuid) from public;
grant execute on function app.job_open(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Ledger and stock links
-- ---------------------------------------------------------------------------
alter table public.transactions add column job_id uuid references public.jobs (id);
create index transactions_job_idx on public.transactions (job_id);

alter table public.transactions drop constraint transactions_category_rules;
alter table public.transactions add constraint transactions_category_rules check (
  case category
    when 'car_purchase' then kind = 'expense' and car_id is not null and job_id is null
    when 'car_part' then kind = 'expense' and car_id is not null and job_id is null
    when 'car_cost' then kind = 'expense' and car_id is not null and job_id is null and expense_category_id is not null
    when 'car_sale' then kind = 'income' and car_id is not null and job_id is null
    when 'job_part' then kind = 'expense' and job_id is not null and car_id is null
    when 'job_payment' then kind = 'income' and job_id is not null and car_id is null
    when 'stock_purchase' then kind = 'expense' and car_id is null and job_id is null
    when 'deposit' then kind = 'deposit' and car_id is null and job_id is null
    when 'withdrawal' then kind = 'withdrawal' and car_id is null and job_id is null
    when 'transfer' then kind = 'transfer' and car_id is null and job_id is null
    when 'settlement' then kind = 'transfer' and settlement_id is not null
    when 'workshop_expense' then kind = 'expense' and car_id is null and job_id is null and expense_category_id is not null
    when 'other_income' then kind = 'income' and car_id is null and job_id is null
    else false
  end
);

alter table public.stock_movements add column job_id uuid references public.jobs (id);
create index stock_movements_job_idx on public.stock_movements (job_id);
alter table public.stock_movements drop constraint stock_movements_target;
alter table public.stock_movements add constraint stock_movements_target check (
  case type
    when 'use_car' then car_id is not null and job_id is null
    when 'use_job' then job_id is not null and car_id is null
    when 'return' then num_nonnulls(car_id, job_id) = 1
    else car_id is null and job_id is null
  end
);

-- ---------------------------------------------------------------------------
-- Job lines: what the customer is charged
-- ---------------------------------------------------------------------------
create table public.job_lines (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  kind text not null check (kind in ('stock', 'bought', 'other')),
  description text not null check (char_length(btrim(description)) between 1 and 200),
  qty numeric(12, 3) not null default 1 check (qty > 0),
  unit text,
  -- the line total charged to the customer
  sale_price_cents bigint not null check (sale_price_cents >= 0),
  -- undoing the stock movement on the item page removes the line too
  stock_movement_id uuid unique references public.stock_movements (id) on delete cascade,
  -- deleting the purchase removes the line too
  transaction_id uuid unique references public.transactions (id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint job_lines_stock_link check ((kind = 'stock') = (stock_movement_id is not null)),
  constraint job_lines_bought_link check ((kind = 'bought') = (transaction_id is not null))
);
create index job_lines_job_idx on public.job_lines (job_id);

create trigger job_lines_audit before insert or update on public.job_lines
  for each row execute function app.stamp_audit();

-- ---------------------------------------------------------------------------
-- Settlements can be for a job too
-- ---------------------------------------------------------------------------
alter table public.settlements
  add column job_id uuid unique references public.jobs (id),
  add constraint settlements_one_target check (num_nonnulls(car_id, job_id) = 1);

-- ---------------------------------------------------------------------------
-- Gapless counters (invoice numbers). Only database functions touch them.
-- ---------------------------------------------------------------------------
create table public.counters (
  name text primary key,
  value integer not null
);
alter table public.counters enable row level security;
revoke all on public.counters from anon, authenticated;
grant all on public.counters to service_role;

-- ---------------------------------------------------------------------------
-- Job totals per job (TypeScript computes due / outstanding / profit)
-- ---------------------------------------------------------------------------
create view public.job_summaries with (security_invoker = true) as
select
  j.id as job_id,
  coalesce(s.stock_cents, 0)::bigint as stock_cents,
  coalesce(t.parts_cents, 0)::bigint as parts_cents,
  coalesce(t.payments_cents, 0)::bigint as payments_cents,
  coalesce(l.lines_cents, 0)::bigint as lines_cents,
  j.labor_price_cents as labor_cents
from public.jobs j
left join (
  select job_id,
         sum(amount_cents) filter (where category = 'job_part') as parts_cents,
         sum(amount_cents) filter (where category = 'job_payment') as payments_cents
  from public.transactions where job_id is not null group by job_id
) t on t.job_id = j.id
left join (
  select job_id, -sum(value_delta_cents) as stock_cents
  from public.stock_movements where job_id is not null group by job_id
) s on s.job_id = j.id
left join (
  select job_id, sum(sale_price_cents) as lines_cents from public.job_lines group by job_id
) l on l.job_id = j.id;

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
alter table public.jobs enable row level security;
alter table public.job_shares enable row level security;
alter table public.job_lines enable row level security;

revoke all on public.jobs, public.job_shares, public.job_lines, public.job_summaries from anon, authenticated;
grant all on public.jobs, public.job_shares, public.job_lines, public.job_summaries to service_role;
grant select on public.jobs, public.job_shares, public.job_lines, public.job_summaries to authenticated;

grant insert (id, ref, customer_id, car_make, car_model, car_plate, car_vin, description, status, labor_price_cents,
              done_on, notes)
  on public.jobs to authenticated;
grant update (ref, customer_id, car_make, car_model, car_plate, car_vin, description, status, labor_price_cents,
              done_on, notes)
  on public.jobs to authenticated;
grant delete on public.jobs to authenticated;

create policy "members read jobs" on public.jobs
  for select to authenticated using ((select app.is_member()));
create policy "members add jobs" on public.jobs
  for insert to authenticated with check ((select app.is_member()));
create policy "members edit open jobs" on public.jobs
  for update to authenticated using ((select app.is_member()) and settled_at is null)
  with check ((select app.is_member()) and settled_at is null);
-- only works while nothing is attached (foreign keys)
create policy "members delete open jobs" on public.jobs
  for delete to authenticated using ((select app.is_member()) and settled_at is null);

create policy "members read job shares" on public.job_shares
  for select to authenticated using ((select app.is_member()));

-- "other" lines are written directly; stock and bought lines through functions. Prices and texts are editable.
grant insert (id, job_id, kind, description, qty, unit, sale_price_cents, sort_order) on public.job_lines to authenticated;
grant update (description, qty, unit, sale_price_cents, sort_order) on public.job_lines to authenticated;
grant delete on public.job_lines to authenticated;

create policy "members read job lines" on public.job_lines
  for select to authenticated using ((select app.is_member()));
create policy "members add other lines" on public.job_lines
  for insert to authenticated with check ((select app.is_member()) and kind = 'other' and app.job_open(job_id));
create policy "members edit job lines" on public.job_lines
  for update to authenticated using ((select app.is_member()) and app.job_open(job_id))
  with check ((select app.is_member()) and app.job_open(job_id));
create policy "members delete other lines" on public.job_lines
  for delete to authenticated using ((select app.is_member()) and kind = 'other' and app.job_open(job_id));

-- job money: payments are written directly, bought parts through save_job_bought_line (but can be deleted)
grant insert (job_id) on public.transactions to authenticated;

drop policy "members add money" on public.transactions;
drop policy "members edit money" on public.transactions;
drop policy "members delete money" on public.transactions;

create policy "members add money" on public.transactions
  for insert to authenticated
  with check (
    (select app.is_member())
    and (
      (category in ('car_purchase', 'car_part', 'car_cost', 'car_sale') and app.car_open(car_id))
      or (category = 'job_payment' and app.job_open(job_id))
      or category in ('deposit', 'withdrawal', 'transfer')
    )
  );

create policy "members edit money" on public.transactions
  for update to authenticated
  using (
    (select app.is_member())
    and settlement_id is null
    and (
      (category in ('car_purchase', 'car_part', 'car_cost', 'car_sale') and app.car_open(car_id))
      or (category = 'job_payment' and app.job_open(job_id))
      or category in ('deposit', 'withdrawal', 'transfer')
    )
  )
  with check (
    (select app.is_member())
    and (car_id is null or app.car_open(car_id))
    and (job_id is null or app.job_open(job_id))
  );

create policy "members delete money" on public.transactions
  for delete to authenticated
  using (
    (select app.is_member())
    and settlement_id is null
    and (
      (category in ('car_purchase', 'car_part', 'car_cost', 'car_sale') and app.car_open(car_id))
      or (category in ('job_part', 'job_payment') and app.job_open(job_id))
      or category in ('deposit', 'withdrawal', 'transfer', 'workshop_expense', 'other_income')
    )
  );

-- ---------------------------------------------------------------------------
-- post_stock_movement: + use on a job and return from a job (new parameter p_job_id)
-- ---------------------------------------------------------------------------
drop function public.post_stock_movement(uuid, integer, public.movement_type, numeric, bigint, date, text, text, text, uuid, jsonb, uuid);

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
  p_car_id uuid default null,
  p_job_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.items%rowtype;
  v_car public.cars%rowtype;
  v_job public.jobs%rowtype;
  v_target text;
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
  if p_occurred_on is null or p_occurred_on > current_date + 1 then
    raise exception 'Choose a date that is not in the future';
  end if;

  -- which car or job the movement belongs to
  if p_car_id is not null and p_job_id is not null then
    raise exception 'A movement belongs to a car or a job, not both';
  end if;
  if p_type = 'use_car' or (p_type = 'return' and p_car_id is not null) then
    select * into v_car from public.cars where id = p_car_id;
    if not found then
      raise exception 'Choose a car';
    end if;
    if v_car.settled_at is not null then
      raise exception 'Car % is already settled', v_car.ref;
    end if;
    v_target := v_car.ref;
  elsif p_type = 'use_job' or (p_type = 'return' and p_job_id is not null) then
    select * into v_job from public.jobs where id = p_job_id;
    if not found then
      raise exception 'Choose a job';
    end if;
    if v_job.settled_at is not null then
      raise exception 'Job % is already settled', v_job.ref;
    end if;
    v_target := v_job.ref;
  elsif p_type = 'return' then
    raise exception 'Choose the car or job the parts come back from';
  elsif p_car_id is not null or p_job_id is not null then
    raise exception 'Only use and return movements belong to a car or job';
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
    -- parts come back at exactly what the car or job was charged for them
    select coalesce(-sum(m.qty_delta), 0), coalesce(-sum(m.value_delta_cents), 0)
    into v_used_qty, v_used_value
    from public.stock_movements m
    where m.item_id = p_item_id
      and ((p_car_id is not null and m.car_id = p_car_id) or (p_job_id is not null and m.job_id = p_job_id));
    if p_qty_delta > v_used_qty then
      raise exception 'Only % of % is on %', app.fmt_qty(v_used_qty, v_unit), v_item.name, v_target;
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
    (item_id, type, occurred_on, qty_delta, value_delta_cents, supplier, reason, note, transaction_id, car_id, job_id)
  values
    (p_item_id, p_type, p_occurred_on, p_qty_delta, p_value_delta_cents,
     nullif(btrim(p_supplier), ''), nullif(btrim(p_reason), ''), nullif(btrim(p_note), ''), v_txn_id, p_car_id, p_job_id)
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
    when 'use_car' then format('Used %s %s on %s', app.fmt_qty(-p_qty_delta, v_unit), v_item.name, v_target)
    when 'use_job' then format('Used %s %s on %s', app.fmt_qty(-p_qty_delta, v_unit), v_item.name, v_target)
    when 'return' then format('Returned %s %s from %s to stock', app.fmt_qty(p_qty_delta, v_unit), v_item.name, v_target)
    else format('%s: %s%s %s', btrim(p_reason), case when p_qty_delta > 0 then '+' else '' end,
                app.fmt_qty(p_qty_delta, v_unit), v_item.name)
  end;
  perform app.log_activity('item', p_item_id, p_type::text, v_summary);

  return v_movement_id;
end;
$$;

revoke all on function public.post_stock_movement(uuid, integer, public.movement_type, numeric, bigint, date, text, text, text, uuid, jsonb, uuid, uuid) from public, anon;
grant execute on function public.post_stock_movement(uuid, integer, public.movement_type, numeric, bigint, date, text, text, text, uuid, jsonb, uuid, uuid) to authenticated;

-- undo also refuses movements of settled jobs
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
  if v_m.job_id is not null and not app.job_open(v_m.job_id) then
    raise exception 'That job is already settled';
  end if;
  select * into v_item from public.items where id = v_m.item_id for update;
  select u.name into v_unit from public.units u where u.id = v_item.unit_id;

  if exists (select 1 from public.stock_movements m where m.item_id = v_m.item_id and m.seq > v_m.seq) then
    raise exception 'Only the latest movement of an item can be undone. Correct older ones with Adjust.';
  end if;
  if v_item.qty_on_hand - v_m.qty_delta < 0 or v_item.stock_value_cents - v_m.value_delta_cents < 0 then
    raise exception 'This movement can''t be undone';
  end if;

  delete from public.stock_movements where id = v_m.id; -- allocations (and a job line) go with it
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

-- ---------------------------------------------------------------------------
-- Job lines through functions
-- ---------------------------------------------------------------------------

-- parts from stock on a job: the stock movement and the customer's line in one go
create function public.add_job_stock_line(
  p_job_id uuid,
  p_item_id uuid,
  p_expected_version integer,
  p_qty_delta numeric,
  p_value_delta_cents bigint,
  p_sale_price_cents bigint,
  p_description text,
  p_occurred_on date default current_date
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movement_id uuid;
  v_line_id uuid;
  v_unit text;
begin
  if p_sale_price_cents is null or p_sale_price_cents < 0 then
    raise exception 'Enter a price for the customer';
  end if;
  v_movement_id := public.post_stock_movement(
    p_item_id, p_expected_version, 'use_job', p_qty_delta, p_value_delta_cents, p_occurred_on,
    null, null, null, null, '[]'::jsonb, null, p_job_id);
  select u.name into v_unit from public.items i join public.units u on u.id = i.unit_id where i.id = p_item_id;
  insert into public.job_lines (job_id, kind, description, qty, unit, sale_price_cents, stock_movement_id)
  values (p_job_id, 'stock', btrim(p_description), -p_qty_delta, v_unit, p_sale_price_cents, v_movement_id)
  returning id into v_line_id;
  return v_line_id;
end;
$$;

-- taking a stock line off a job: the parts go back to stock (at what the job was charged), the line goes
create function public.remove_job_stock_line(
  p_line_id uuid,
  p_expected_version integer,
  p_value_delta_cents bigint
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.job_lines%rowtype;
  v_movement public.stock_movements%rowtype;
begin
  if not (select app.is_member()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_line from public.job_lines where id = p_line_id and kind = 'stock';
  if not found then
    raise exception 'Line not found';
  end if;
  select * into v_movement from public.stock_movements where id = v_line.stock_movement_id;
  perform public.post_stock_movement(
    v_movement.item_id, p_expected_version, 'return', -v_movement.qty_delta, p_value_delta_cents, current_date,
    null, null, null, null, '[]'::jsonb, null, v_line.job_id);
  -- the use movement stays in the item's history; only the customer's line goes
  delete from public.job_lines where id = p_line_id;
end;
$$;

-- a part bought for a job: the expense (who paid) and the customer's line together
create function public.save_job_bought_line(
  p_line_id uuid,
  p_job_id uuid,
  p_description text,
  p_qty numeric,
  p_cost_cents bigint,
  p_paid_by uuid,
  p_supplier text,
  p_sale_price_cents bigint,
  p_occurred_on date default current_date
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.job_lines%rowtype;
  v_txn_id uuid;
  v_external uuid;
  v_payer_ok boolean;
  v_line_id uuid;
begin
  if not (select app.is_member()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not app.job_open(p_job_id) then
    raise exception 'This job is settled or doesn''t exist';
  end if;
  if char_length(btrim(coalesce(p_description, ''))) = 0 then
    raise exception 'What part?';
  end if;
  if p_cost_cents is null or p_cost_cents <= 0 then
    raise exception 'Enter what the part cost';
  end if;
  if p_sale_price_cents is null or p_sale_price_cents < 0 then
    raise exception 'Enter a price for the customer';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Enter a quantity';
  end if;
  select (a.kind = 'wallet' or (a.kind = 'partner' and p.is_active)) into v_payer_ok
  from public.accounts a left join public.profiles p on p.id = a.partner_id
  where a.id = p_paid_by;
  if not coalesce(v_payer_ok, false) then
    raise exception 'Choose who paid';
  end if;
  select a.id into v_external from public.accounts a where a.kind = 'external';

  if p_line_id is null then
    insert into public.transactions
      (occurred_on, amount_cents, kind, category, from_account_id, to_account_id, description, counterparty, job_id)
    values
      (p_occurred_on, p_cost_cents, 'expense', 'job_part', p_paid_by, v_external, btrim(p_description),
       nullif(btrim(p_supplier), ''), p_job_id)
    returning id into v_txn_id;
    insert into public.job_lines (job_id, kind, description, qty, sale_price_cents, transaction_id)
    values (p_job_id, 'bought', btrim(p_description), p_qty, p_sale_price_cents, v_txn_id)
    returning id into v_line_id;
    return v_line_id;
  end if;

  select * into v_line from public.job_lines where id = p_line_id and job_id = p_job_id and kind = 'bought';
  if not found then
    raise exception 'Line not found';
  end if;
  update public.transactions
  set occurred_on = p_occurred_on, amount_cents = p_cost_cents, from_account_id = p_paid_by,
      description = btrim(p_description), counterparty = nullif(btrim(p_supplier), '')
  where id = v_line.transaction_id;
  update public.job_lines
  set description = btrim(p_description), qty = p_qty, sale_price_cents = p_sale_price_cents
  where id = p_line_id;
  return p_line_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invoice numbers: gapless per year, assigned once (2026-001, 2026-002 …)
-- ---------------------------------------------------------------------------
create function public.issue_invoice_number(p_job_id uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs%rowtype;
  v_year text := to_char(current_date, 'YYYY');
  v_next integer;
  v_number text;
begin
  if not (select app.is_member()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job not found';
  end if;
  if v_job.invoice_number is not null then
    return v_job.invoice_number;
  end if;
  insert into public.counters (name, value) values ('invoice-' || v_year, 1)
  on conflict (name) do update set value = public.counters.value + 1
  returning value into v_next;
  v_number := v_year || '-' || lpad(v_next::text, 3, '0');
  update public.jobs set invoice_number = v_number, invoice_date = current_date where id = p_job_id;
  perform app.log_activity('job', p_job_id, 'invoice', format('Invoice %s for %s', v_number, v_job.ref));
  return v_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shares and settling up for jobs (record/undo_settlement now take a car OR a job)
-- ---------------------------------------------------------------------------
create function public.set_job_shares(p_job_id uuid, p_shares jsonb) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
begin
  if not (select app.is_member()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not app.job_open(p_job_id) then
    raise exception 'This job is settled or doesn''t exist';
  end if;
  select coalesce(sum((s ->> 'share_bp')::integer), 0) into v_total from jsonb_array_elements(p_shares) s;
  if v_total <> 10000 then
    raise exception 'Shares must add up to 100 %%';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_shares) s
    where (s ->> 'share_bp')::integer < 0
       or not exists (select 1 from public.profiles p where p.id = (s ->> 'partner_id')::uuid)
  ) then
    raise exception 'Invalid shares';
  end if;
  delete from public.job_shares where job_id = p_job_id;
  insert into public.job_shares (job_id, partner_id, share_bp)
  select p_job_id, (s ->> 'partner_id')::uuid, (s ->> 'share_bp')::integer
  from jsonb_array_elements(p_shares) s
  where (s ->> 'share_bp')::integer > 0;
end;
$$;

drop function public.record_settlement(uuid, text, boolean, date, jsonb, jsonb, jsonb);
drop function public.undo_settlement(uuid);

create function public.record_settlement(
  p_payout_mode text,
  p_reimburse boolean,
  p_settled_on date,
  p_allocations jsonb,
  p_transfers jsonb,
  p_breakdown jsonb default '{}'::jsonb,
  p_car_id uuid default null,
  p_job_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text;
  v_status text;
  v_settled timestamptz;
  v_profit bigint;
  v_alloc_total bigint;
  v_shares_total integer;
  v_settlement_id uuid;
begin
  if not (select app.is_member()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if num_nonnulls(p_car_id, p_job_id) <> 1 then
    raise exception 'Settle a car or a job';
  end if;
  if p_payout_mode not in ('retain', 'payout') then
    raise exception 'Unknown payout mode';
  end if;

  if p_car_id is not null then
    select c.ref, c.status::text, c.settled_at into v_ref, v_status, v_settled from public.cars c where c.id = p_car_id for update;
    if v_ref is null then
      raise exception 'Car not found';
    end if;
    if v_status not in ('sold', 'scrapped') then
      raise exception 'Only a sold or scrapped car can be settled';
    end if;
    select s.sale_cents - (s.purchase_cents + s.stock_cents + s.parts_cents + s.other_costs_cents) into v_profit
    from public.car_summaries s where s.car_id = p_car_id;
    select coalesce(sum(share_bp), 0) into v_shares_total from public.car_shares where car_id = p_car_id;
  else
    select j.ref, j.status::text, j.settled_at into v_ref, v_status, v_settled from public.jobs j where j.id = p_job_id for update;
    if v_ref is null then
      raise exception 'Job not found';
    end if;
    if v_status <> 'paid' then
      raise exception 'Only a paid job can be settled';
    end if;
    select s.payments_cents - (s.stock_cents + s.parts_cents) into v_profit
    from public.job_summaries s where s.job_id = p_job_id;
    select coalesce(sum(share_bp), 0) into v_shares_total from public.job_shares where job_id = p_job_id;
  end if;

  if v_settled is not null then
    raise exception '% is already settled', v_ref;
  end if;
  if v_shares_total <> 10000 then
    raise exception 'The profit shares must add up to 100 %%';
  end if;

  select coalesce(sum((a ->> 'amount_cents')::bigint), 0) into v_alloc_total from jsonb_array_elements(p_allocations) a;
  if v_alloc_total <> v_profit then
    raise exception 'Profit split doesn''t add up: % vs %', v_alloc_total, v_profit;
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_allocations) a
    where (a ->> 'amount_cents')::bigint <> 0
      and not exists (
        select 1 from public.car_shares cs
        where p_car_id is not null and cs.car_id = p_car_id and cs.partner_id = (a ->> 'partner_id')::uuid
        union all
        select 1 from public.job_shares js
        where p_job_id is not null and js.job_id = p_job_id and js.partner_id = (a ->> 'partner_id')::uuid
      )
  ) then
    raise exception 'Profit can only go to partners with a share in %', v_ref;
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_transfers) t
    left join public.accounts f on f.id = (t ->> 'from_account_id')::uuid
    left join public.accounts r on r.id = (t ->> 'to_account_id')::uuid
    where (t ->> 'amount_cents')::bigint <= 0
       or f.id is null or r.id is null or f.id = r.id
       or f.kind = 'external' or r.kind = 'external'
  ) then
    raise exception 'Invalid transfer';
  end if;

  insert into public.settlements (car_id, job_id, settled_on, payout_mode, reimburse, breakdown)
  values (p_car_id, p_job_id, coalesce(p_settled_on, current_date), p_payout_mode, p_reimburse, coalesce(p_breakdown, '{}'::jsonb))
  returning id into v_settlement_id;

  insert into public.allocations (partner_id, amount_cents, occurred_on, settlement_id)
  select (a ->> 'partner_id')::uuid, (a ->> 'amount_cents')::bigint, coalesce(p_settled_on, current_date), v_settlement_id
  from jsonb_array_elements(p_allocations) a
  where (a ->> 'amount_cents')::bigint <> 0;

  -- settlement transfers carry the settlement id only (car/job ids are for car/job money)
  insert into public.transactions
    (occurred_on, amount_cents, kind, category, from_account_id, to_account_id, description, settlement_id)
  select coalesce(p_settled_on, current_date), (t ->> 'amount_cents')::bigint, 'transfer', 'settlement',
         (t ->> 'from_account_id')::uuid, (t ->> 'to_account_id')::uuid, 'Settle up ' || v_ref, v_settlement_id
  from jsonb_array_elements(p_transfers) t;

  if p_car_id is not null then
    update public.cars set settled_at = now() where id = p_car_id;
  else
    update public.jobs set settled_at = now() where id = p_job_id;
  end if;

  perform app.log_activity(case when p_car_id is not null then 'car' else 'job' end, coalesce(p_car_id, p_job_id), 'settle',
    format('Settled %s: %s %s', v_ref, case when v_profit >= 0 then 'profit' else 'loss' end, app.fmt_eur(abs(v_profit))));
  return v_settlement_id;
end;
$$;

create function public.undo_settlement(p_car_id uuid default null, p_job_id uuid default null) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text;
  v_settled timestamptz;
begin
  if not (select app.is_member()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if num_nonnulls(p_car_id, p_job_id) <> 1 then
    raise exception 'Undo for a car or a job';
  end if;
  if p_car_id is not null then
    select c.ref, c.settled_at into v_ref, v_settled from public.cars c where c.id = p_car_id for update;
  else
    select j.ref, j.settled_at into v_ref, v_settled from public.jobs j where j.id = p_job_id for update;
  end if;
  if v_settled is null then
    raise exception 'This isn''t settled';
  end if;
  -- the settlement's allocations and transfers go with it
  delete from public.settlements where car_id = p_car_id or job_id = p_job_id;
  if p_car_id is not null then
    update public.cars set settled_at = null where id = p_car_id;
  else
    update public.jobs set settled_at = null where id = p_job_id;
  end if;
  perform app.log_activity(case when p_car_id is not null then 'car' else 'job' end, coalesce(p_car_id, p_job_id), 'unsettle',
    format('Undid the settlement of %s', v_ref));
end;
$$;

revoke all on function public.add_job_stock_line(uuid, uuid, integer, numeric, bigint, bigint, text, date) from public, anon;
revoke all on function public.remove_job_stock_line(uuid, integer, bigint) from public, anon;
revoke all on function public.save_job_bought_line(uuid, uuid, text, numeric, bigint, uuid, text, bigint, date) from public, anon;
revoke all on function public.issue_invoice_number(uuid) from public, anon;
revoke all on function public.set_job_shares(uuid, jsonb) from public, anon;
revoke all on function public.record_settlement(text, boolean, date, jsonb, jsonb, jsonb, uuid, uuid) from public, anon;
revoke all on function public.undo_settlement(uuid, uuid) from public, anon;
grant execute on function public.add_job_stock_line(uuid, uuid, integer, numeric, bigint, bigint, text, date) to authenticated;
grant execute on function public.remove_job_stock_line(uuid, integer, bigint) to authenticated;
grant execute on function public.save_job_bought_line(uuid, uuid, text, numeric, bigint, uuid, text, bigint, date) to authenticated;
grant execute on function public.issue_invoice_number(uuid) to authenticated;
grant execute on function public.set_job_shares(uuid, jsonb) to authenticated;
grant execute on function public.record_settlement(text, boolean, date, jsonb, jsonb, jsonb, uuid, uuid) to authenticated;
grant execute on function public.undo_settlement(uuid, uuid) to authenticated;
