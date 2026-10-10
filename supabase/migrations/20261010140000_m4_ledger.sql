-- M4 · wallet, ledger and settling up.
--
-- Ledger categories (transactions.category) and their kind:
--   car_purchase / car_part / car_cost (expense) · car_sale (income)        – money of a car (M3)
--   stock_purchase (expense)                                               – via post_stock_movement (M2)
--   deposit · withdrawal · transfer                                        – written directly by members
--   workshop_expense (expense) · other_income (income)                     – via save_workshop_money():
--        general money not tied to a car; split between partners by default shares (allocations)
--   settlement (transfer)                                                  – via record_settlement()

-- ---------------------------------------------------------------------------
-- Settlements
-- ---------------------------------------------------------------------------
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  car_id uuid unique references public.cars (id),
  settled_on date not null default current_date,
  payout_mode text not null check (payout_mode in ('retain', 'payout')),
  reimburse boolean not null,
  -- the numbers as they were at settlement, for the record
  breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

create trigger settlements_audit before insert or update on public.settlements
  for each row execute function app.stamp_audit();

alter table public.transactions
  add column settlement_id uuid references public.settlements (id) on delete cascade;
create index transactions_settlement_idx on public.transactions (settlement_id);

alter table public.allocations
  add column settlement_id uuid references public.settlements (id) on delete cascade;
create index allocations_settlement_idx on public.allocations (settlement_id);
alter table public.allocations
  drop constraint allocations_one_source,
  add constraint allocations_one_source check (num_nonnulls(transaction_id, stock_movement_id, settlement_id) = 1);

-- every category has fixed rules
alter table public.transactions drop constraint transactions_car_rules;
alter table public.transactions add constraint transactions_category_rules check (
  case category
    when 'car_purchase' then kind = 'expense' and car_id is not null
    when 'car_part' then kind = 'expense' and car_id is not null
    when 'car_cost' then kind = 'expense' and car_id is not null and expense_category_id is not null
    when 'car_sale' then kind = 'income' and car_id is not null
    when 'stock_purchase' then kind = 'expense' and car_id is null
    when 'deposit' then kind = 'deposit' and car_id is null
    when 'withdrawal' then kind = 'withdrawal' and car_id is null
    when 'transfer' then kind = 'transfer' and car_id is null
    when 'settlement' then kind = 'transfer' and settlement_id is not null
    when 'workshop_expense' then kind = 'expense' and car_id is null and expense_category_id is not null
    when 'other_income' then kind = 'income' and car_id is null
    else false
  end
);

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
alter table public.settlements enable row level security;
revoke all on public.settlements from anon, authenticated;
grant all on public.settlements to service_role;
grant select on public.settlements to authenticated;
create policy "members read settlements" on public.settlements
  for select to authenticated using ((select app.is_member()));

-- one set of policies for everything members may write directly
drop policy "members add car money" on public.transactions;
drop policy "members edit car money" on public.transactions;
drop policy "members delete car money" on public.transactions;

create policy "members add money" on public.transactions
  for insert to authenticated
  with check (
    (select app.is_member())
    and (
      (category in ('car_purchase', 'car_part', 'car_cost', 'car_sale') and app.car_open(car_id))
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
      or category in ('deposit', 'withdrawal', 'transfer')
    )
  )
  with check ((select app.is_member()) and (car_id is null or app.car_open(car_id)));

-- general expenses/income can be deleted directly (their allocations go with them)
create policy "members delete money" on public.transactions
  for delete to authenticated
  using (
    (select app.is_member())
    and settlement_id is null
    and (
      (category in ('car_purchase', 'car_part', 'car_cost', 'car_sale') and app.car_open(car_id))
      or category in ('deposit', 'withdrawal', 'transfer', 'workshop_expense', 'other_income')
    )
  );

-- ---------------------------------------------------------------------------
-- save_workshop_money: a general expense or income (not tied to a car),
-- split between partners by the given allocations (default shares, computed in the app)
-- ---------------------------------------------------------------------------
create function public.save_workshop_money(
  p_id uuid,
  p_kind public.txn_kind,
  p_amount_cents bigint,
  p_account_id uuid,
  p_occurred_on date,
  p_expense_category_id uuid default null,
  p_description text default null,
  p_counterparty text default null,
  p_allocations jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_external uuid;
  v_account_ok boolean;
  v_alloc_total bigint;
  v_expected bigint;
  v_category text;
begin
  if not (select app.is_member()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_kind not in ('expense', 'income') then
    raise exception 'Only expenses and income';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Enter an amount';
  end if;
  if p_occurred_on is null or p_occurred_on > current_date + 1 then
    raise exception 'Choose a date that is not in the future';
  end if;
  v_category := case p_kind when 'expense' then 'workshop_expense' else 'other_income' end;

  select (a.kind = 'wallet' or (a.kind = 'partner' and p.is_active)) into v_account_ok
  from public.accounts a left join public.profiles p on p.id = a.partner_id
  where a.id = p_account_id;
  if not coalesce(v_account_ok, false) then
    raise exception 'Choose the wallet or a partner';
  end if;
  select a.id into v_external from public.accounts a where a.kind = 'external';

  -- an expense makes every partner a bit poorer, income a bit richer
  v_expected := case p_kind when 'expense' then -p_amount_cents else p_amount_cents end;
  select coalesce(sum((a ->> 'amount_cents')::bigint), 0) into v_alloc_total from jsonb_array_elements(p_allocations) a;
  if v_alloc_total <> v_expected then
    raise exception 'Profit shares don''t add up: % vs %', v_alloc_total, v_expected;
  end if;

  if p_id is null then
    insert into public.transactions
      (occurred_on, amount_cents, kind, category, from_account_id, to_account_id, expense_category_id, description, counterparty)
    values
      (p_occurred_on, p_amount_cents, p_kind, v_category,
       case p_kind when 'expense' then p_account_id else v_external end,
       case p_kind when 'expense' then v_external else p_account_id end,
       case p_kind when 'expense' then p_expense_category_id end,
       nullif(btrim(p_description), ''), nullif(btrim(p_counterparty), ''))
    returning id into v_id;
  else
    update public.transactions
    set occurred_on = p_occurred_on,
        amount_cents = p_amount_cents,
        from_account_id = case p_kind when 'expense' then p_account_id else v_external end,
        to_account_id = case p_kind when 'expense' then v_external else p_account_id end,
        expense_category_id = case p_kind when 'expense' then p_expense_category_id end,
        description = nullif(btrim(p_description), ''),
        counterparty = nullif(btrim(p_counterparty), '')
    where id = p_id and category = v_category and settlement_id is null
    returning id into v_id;
    if v_id is null then
      raise exception 'Entry not found';
    end if;
    delete from public.allocations where transaction_id = v_id;
  end if;

  insert into public.allocations (partner_id, amount_cents, occurred_on, transaction_id)
  select (a ->> 'partner_id')::uuid, (a ->> 'amount_cents')::bigint, p_occurred_on, v_id
  from jsonb_array_elements(p_allocations) a
  where (a ->> 'amount_cents')::bigint <> 0;

  perform app.log_activity('transaction', v_id, case when p_id is null then 'add' else 'edit' end,
    format('%s %s%s', case p_kind when 'expense' then 'Workshop expense' else 'Other income' end,
           app.fmt_eur(p_amount_cents), coalesce(': ' || nullif(btrim(p_description), ''), '')));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_car_shares: replace a car's profit shares (must add up to 100 %)
-- ---------------------------------------------------------------------------
create function public.set_car_shares(p_car_id uuid, p_shares jsonb) returns void
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
  if not app.car_open(p_car_id) then
    raise exception 'This car is settled or doesn''t exist';
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
  delete from public.car_shares where car_id = p_car_id;
  insert into public.car_shares (car_id, partner_id, share_bp)
  select p_car_id, (s ->> 'partner_id')::uuid, (s ->> 'share_bp')::integer
  from jsonb_array_elements(p_shares) s
  where (s ->> 'share_bp')::integer > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_settlement / undo_settlement
-- The app computes allocations and transfers (src/domain/settlement.ts); the database re-checks
-- the profit from the car's own numbers and that the allocations follow the car's shares.
-- ---------------------------------------------------------------------------
create function public.record_settlement(
  p_car_id uuid,
  p_payout_mode text,
  p_reimburse boolean,
  p_settled_on date,
  p_allocations jsonb,
  p_transfers jsonb,
  p_breakdown jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_car public.cars%rowtype;
  v_profit bigint;
  v_alloc_total bigint;
  v_shares_total integer;
  v_settlement_id uuid;
begin
  if not (select app.is_member()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_car from public.cars where id = p_car_id for update;
  if not found then
    raise exception 'Car not found';
  end if;
  if v_car.settled_at is not null then
    raise exception 'Car % is already settled', v_car.ref;
  end if;
  if v_car.status not in ('sold', 'scrapped') then
    raise exception 'Only a sold or scrapped car can be settled';
  end if;
  if p_payout_mode not in ('retain', 'payout') then
    raise exception 'Unknown payout mode';
  end if;

  select s.sale_cents - (s.purchase_cents + s.stock_cents + s.parts_cents + s.other_costs_cents) into v_profit
  from public.car_summaries s where s.car_id = p_car_id;

  select coalesce(sum(share_bp), 0) into v_shares_total from public.car_shares where car_id = p_car_id;
  if v_shares_total <> 10000 then
    raise exception 'The car''s profit shares must add up to 100 %%';
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
        where cs.car_id = p_car_id and cs.partner_id = (a ->> 'partner_id')::uuid
      )
  ) then
    raise exception 'Profit can only go to partners with a share in this car';
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

  insert into public.settlements (car_id, settled_on, payout_mode, reimburse, breakdown)
  values (p_car_id, coalesce(p_settled_on, current_date), p_payout_mode, p_reimburse, coalesce(p_breakdown, '{}'::jsonb))
  returning id into v_settlement_id;

  insert into public.allocations (partner_id, amount_cents, occurred_on, settlement_id)
  select (a ->> 'partner_id')::uuid, (a ->> 'amount_cents')::bigint, coalesce(p_settled_on, current_date), v_settlement_id
  from jsonb_array_elements(p_allocations) a
  where (a ->> 'amount_cents')::bigint <> 0;

  insert into public.transactions
    (occurred_on, amount_cents, kind, category, from_account_id, to_account_id, description, car_id, settlement_id)
  select coalesce(p_settled_on, current_date), (t ->> 'amount_cents')::bigint, 'transfer', 'settlement',
         (t ->> 'from_account_id')::uuid, (t ->> 'to_account_id')::uuid, 'Settle up ' || v_car.ref, p_car_id, v_settlement_id
  from jsonb_array_elements(p_transfers) t;

  update public.cars set settled_at = now() where id = p_car_id;

  perform app.log_activity('car', p_car_id, 'settle',
    format('Settled %s: %s %s', v_car.ref, case when v_profit >= 0 then 'profit' else 'loss' end, app.fmt_eur(abs(v_profit))));
  return v_settlement_id;
end;
$$;

create function public.undo_settlement(p_car_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_car public.cars%rowtype;
begin
  if not (select app.is_member()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_car from public.cars where id = p_car_id for update;
  if not found or v_car.settled_at is null then
    raise exception 'This car isn''t settled';
  end if;
  -- the settlement's allocations and transfers go with it
  delete from public.settlements where car_id = p_car_id;
  update public.cars set settled_at = null where id = p_car_id;
  perform app.log_activity('car', p_car_id, 'unsettle', format('Undid the settlement of %s', v_car.ref));
end;
$$;

revoke all on function public.save_workshop_money(uuid, public.txn_kind, bigint, uuid, date, uuid, text, text, jsonb) from public, anon;
revoke all on function public.set_car_shares(uuid, jsonb) from public, anon;
revoke all on function public.record_settlement(uuid, text, boolean, date, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.undo_settlement(uuid) from public, anon;
grant execute on function public.save_workshop_money(uuid, public.txn_kind, bigint, uuid, date, uuid, text, text, jsonb) to authenticated;
grant execute on function public.set_car_shares(uuid, jsonb) to authenticated;
grant execute on function public.record_settlement(uuid, text, boolean, date, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.undo_settlement(uuid) to authenticated;
