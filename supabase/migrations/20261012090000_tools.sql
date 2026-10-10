-- Tools & equipment: what the workshop (or a partner) owns, where it is, who borrowed it, whether it works,
-- and what it cost. Not stock: tools aren't used up, so there are no quantities moving in and out.
--
-- A tool's purchase can be put into Money as a workshop expense (cost type "Tools", split by default
-- profit shares) through save_tool_payment(); the tool then points at that ledger entry.

-- ---------------------------------------------------------------------------
-- Tool categories: a list like the cost types (added on the Lists page, admins rename and delete)
-- ---------------------------------------------------------------------------
create table public.tool_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
create unique index tool_categories_name_key on public.tool_categories (lower(name));

create trigger tool_categories_audit before insert or update on public.tool_categories
  for each row execute function app.stamp_audit();

insert into public.tool_categories (name, sort_order) values
  ('Hand tools', 10),
  ('Power tools', 20),
  ('Air tools', 30),
  ('Lifting & stands', 40),
  ('Diagnostics & electrical', 50),
  ('Measuring', 60),
  ('Special tools', 70),
  ('Workshop equipment', 80),
  ('Other', 90);

-- the cost type tool purchases go under in Money
insert into public.expense_categories (name, sort_order)
select 'Tools', 60
where not exists (select 1 from public.expense_categories where lower(name) = 'tools');

-- ---------------------------------------------------------------------------
-- Tools
-- ---------------------------------------------------------------------------
create table public.tools (
  id uuid primary key default gen_random_uuid(),
  -- the tool's own ID (T-001), generated in the app, editable, unique ignoring case
  code text not null check (char_length(code) between 1 and 20 and code = btrim(code)),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  category_id uuid not null references public.tool_categories (id),
  brand_id uuid references public.brands (id),
  model text check (model is null or char_length(model) <= 80),
  serial_number text check (serial_number is null or char_length(serial_number) <= 80),
  -- e.g. a pair of axle stands
  qty integer not null default 1 check (qty between 1 and 9999),
  -- empty: the workshop's; a partner: theirs, kept in the workshop
  owner_id uuid references public.profiles (id),
  location text check (location is null or char_length(location) <= 80),
  condition text not null default 'good' check (condition in ('good', 'needs_repair', 'broken')),
  -- who has it at the moment (a customer, a friend, a partner taking it home)
  lent_to text check (lent_to is null or (char_length(lent_to) between 1 and 80 and lent_to = btrim(lent_to))),
  lent_on date,
  bought_on date,
  price_cents bigint check (price_cents >= 0),
  bought_from text check (bought_from is null or char_length(bought_from) <= 80),
  warranty_until date,
  -- the workshop expense paying for it (save_tool_payment); deleting that entry in Money unlinks it
  transaction_id uuid unique references public.transactions (id) on delete set null,
  -- no longer owned: kept for the record, hidden from the list
  gone_on date,
  gone_reason text check (gone_reason in ('sold', 'lost', 'stolen', 'scrapped', 'given_away')),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint tools_lent check ((lent_to is null) = (lent_on is null)),
  constraint tools_gone check ((gone_on is null) = (gone_reason is null))
);

create unique index tools_code_key on public.tools (upper(code));
create index tools_category_idx on public.tools (category_id);
create index tools_brand_idx on public.tools (brand_id);
create index tools_owner_idx on public.tools (owner_id);

create trigger tools_audit before insert or update on public.tools
  for each row execute function app.stamp_audit();

-- recent activity and the tool's own history: added, lent, back, condition, gone, deleted
create function app.log_tool_activity() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if tg_op = 'DELETE' then
    perform app.log_activity('tool', old.id, 'delete', format('Deleted tool %s %s', old.code, old.name));
    return old;
  end if;
  v_name := new.code || ' ' || new.name;
  if tg_op = 'INSERT' then
    perform app.log_activity('tool', new.id, 'add', format('Added tool %s', v_name));
    return new;
  end if;
  if new.lent_to is distinct from old.lent_to then
    if new.lent_to is null then
      perform app.log_activity('tool', new.id, 'return', format('%s is back from %s', v_name, old.lent_to));
    else
      perform app.log_activity('tool', new.id, 'lend', format('Lent %s to %s', v_name, new.lent_to));
    end if;
  end if;
  if new.condition is distinct from old.condition then
    perform app.log_activity('tool', new.id, 'condition', format('%s %s', v_name,
      case new.condition when 'good' then 'works again' when 'needs_repair' then 'needs repair' else 'is broken' end));
  end if;
  if new.gone_reason is distinct from old.gone_reason then
    perform app.log_activity('tool', new.id, 'gone',
      case when new.gone_reason is null then format('%s is back in the tools list', v_name)
           else format('%s: %s', v_name, replace(new.gone_reason, '_', ' ')) end);
  end if;
  return new;
end;
$$;
revoke all on function app.log_tool_activity() from public;

create trigger tools_activity after insert or update of lent_to, condition, gone_reason or delete on public.tools
  for each row execute function app.log_tool_activity();

-- photos and receipts of tools (uploaded through the files function)
alter table public.attachments
  drop constraint attachments_entity_type_check,
  add constraint attachments_entity_type_check check (entity_type in ('car', 'job', 'stock_movement', 'transaction', 'tool'));

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
alter table public.tool_categories enable row level security;
alter table public.tools enable row level security;

revoke all on public.tool_categories, public.tools from anon, authenticated;
grant all on public.tool_categories, public.tools to service_role;

grant select, insert, update, delete on public.tool_categories to authenticated;
create policy "members read tool categories" on public.tool_categories
  for select to authenticated using ((select app.is_member()));
create policy "members add tool categories" on public.tool_categories
  for insert to authenticated with check ((select app.is_member()));
create policy "admins edit tool categories" on public.tool_categories
  for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy "admins delete tool categories" on public.tool_categories
  for delete to authenticated using ((select app.is_admin()));

-- members write everything about a tool except its payment link (only save_tool_payment sets it)
grant select, delete on public.tools to authenticated;
grant insert (id, code, name, category_id, brand_id, model, serial_number, qty, owner_id, location, condition,
              lent_to, lent_on, bought_on, price_cents, bought_from, warranty_until, gone_on, gone_reason, notes)
  on public.tools to authenticated;
grant update (code, name, category_id, brand_id, model, serial_number, qty, owner_id, location, condition,
              lent_to, lent_on, bought_on, price_cents, bought_from, warranty_until, gone_on, gone_reason, notes)
  on public.tools to authenticated;

create policy "members read tools" on public.tools
  for select to authenticated using ((select app.is_member()));
create policy "members add tools" on public.tools
  for insert to authenticated with check ((select app.is_member()));
create policy "members edit tools" on public.tools
  for update to authenticated using ((select app.is_member())) with check ((select app.is_member()));
create policy "members delete tools" on public.tools
  for delete to authenticated using ((select app.is_member()));

-- ---------------------------------------------------------------------------
-- save_tool_payment: puts the tool's price into Money as a workshop expense paid by the wallet or a
-- partner (split by the given profit-share allocations), or updates the entry it already has
-- (price, date, seller, who paid). To take it out of Money, delete the entry there.
-- ---------------------------------------------------------------------------
create function public.save_tool_payment(p_tool_id uuid, p_account_id uuid, p_allocations jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tool public.tools%rowtype;
  v_category uuid;
  v_txn uuid;
begin
  if not (select app.is_member()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_tool from public.tools where id = p_tool_id for update;
  if not found then
    raise exception 'Tool not found';
  end if;
  if v_tool.owner_id is not null then
    raise exception 'This tool belongs to a partner. Only the workshop''s own tools are paid with workshop money.';
  end if;
  if coalesce(v_tool.price_cents, 0) <= 0 then
    raise exception 'Enter what the tool cost';
  end if;

  -- keep the cost type the entry already has, else "Tools" (added again if it was deleted)
  select t.expense_category_id into v_category from public.transactions t where t.id = v_tool.transaction_id;
  if v_category is null then
    select c.id into v_category from public.expense_categories c where lower(c.name) = 'tools';
  end if;
  if v_category is null then
    insert into public.expense_categories (name, sort_order) values ('Tools', 60) returning id into v_category;
  end if;

  v_txn := public.save_workshop_money(
    v_tool.transaction_id, 'expense', v_tool.price_cents, p_account_id, coalesce(v_tool.bought_on, current_date),
    v_category, format('Tool: %s (%s)', btrim(v_tool.name), v_tool.code), v_tool.bought_from, p_allocations
  );
  update public.tools set transaction_id = v_txn where id = p_tool_id and transaction_id is distinct from v_txn;
  return v_txn;
end;
$$;

revoke all on function public.save_tool_payment(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_tool_payment(uuid, uuid, jsonb) to authenticated;
