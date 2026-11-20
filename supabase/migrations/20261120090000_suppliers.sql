-- R4 · Suppliers become a list like brands (More → Lists → Suppliers): one shared list, offered when buying
-- stock, a part for a car, a part for a job, or a tool.
--
-- Purchases keep the supplier's name as text, as before (transactions.counterparty, stock_movements.supplier,
-- tools.bought_from). The list is kept in step with them:
--   * a name typed on a purchase is added to the list by itself (trigger),
--   * an admin renaming a supplier renames it on every purchase; renaming to a name that is already on the
--     list merges the two (fixing typos),
--   * a supplier can only be deleted while no purchase uses it.
-- Everyone can add, only admins rename and delete (like the other lists).

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120 and name = btrim(name)),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
create unique index suppliers_name_key on public.suppliers (name);

create trigger suppliers_audit before insert or update on public.suppliers
  for each row execute function app.stamp_audit();

-- the purchases a supplier name can be on
create function app.is_supplier_purchase(p_category text) returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_category in ('stock_purchase', 'car_part', 'job_part');
$$;
grant execute on function app.is_supplier_purchase(text) to authenticated, service_role;

-- every supplier already typed on a purchase
insert into public.suppliers (name)
select distinct btrim(n)
from (
  select counterparty as n from public.transactions where app.is_supplier_purchase(category)
  union all
  select supplier from public.stock_movements
  union all
  select bought_from from public.tools
) typed
where char_length(btrim(coalesce(n, ''))) between 1 and 120
on conflict (name) do nothing;

-- How many purchases use each supplier, most used first in the app.
-- Stock purchases are counted once (their transaction; the stock movement holds the same name).
create view public.supplier_usage with (security_invoker = true) as
select s.id, s.name, count(u.name)::integer as uses
from public.suppliers s
left join (
  select counterparty as name from public.transactions where app.is_supplier_purchase(category)
  union all
  select bought_from from public.tools
) u on u.name = s.name
group by s.id, s.name;

-- ---------------------------------------------------------------------------
-- New names typed on a purchase join the list
-- ---------------------------------------------------------------------------
create function app.remember_supplier() returns trigger
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
  elsif tg_table_name = 'tools' then
    v_name := new.bought_from;
  end if;
  v_name := btrim(coalesce(v_name, ''));
  if char_length(v_name) between 1 and 120 then
    insert into public.suppliers (name) values (v_name) on conflict (name) do nothing;
  end if;
  return null;
end;
$$;
revoke all on function app.remember_supplier() from public;

create trigger transactions_remember_supplier after insert or update of counterparty, category on public.transactions
  for each row execute function app.remember_supplier();
create trigger stock_movements_remember_supplier after insert or update of supplier on public.stock_movements
  for each row execute function app.remember_supplier();
create trigger tools_remember_supplier after insert or update of bought_from on public.tools
  for each row execute function app.remember_supplier();

-- ---------------------------------------------------------------------------
-- Rename (admins): the new name goes on every purchase; an existing entry with that name is merged in
-- ---------------------------------------------------------------------------
create function public.rename_supplier(p_id uuid, p_name text) returns void
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

  delete from public.suppliers where name = v_new and id <> p_id;
  update public.suppliers set name = v_new where id = p_id;
  update public.transactions set counterparty = v_new
    where app.is_supplier_purchase(category) and counterparty = v_old;
  update public.stock_movements set supplier = v_new where supplier = v_old;
  update public.tools set bought_from = v_new where bought_from = v_old;
end;
$$;
revoke all on function public.rename_supplier(uuid, text) from public, anon;
grant execute on function public.rename_supplier(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Delete only while unused (a rename is the way to change a used one)
-- ---------------------------------------------------------------------------
create function app.supplier_not_in_use() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.supplier_usage u where u.id = old.id and u.uses > 0)
     or exists (select 1 from public.stock_movements m where m.supplier = old.name) then
    raise exception 'Still in use. Rename it instead (renaming it to another supplier merges the two).'
      using errcode = '23503';
  end if;
  return old;
end;
$$;
revoke all on function app.supplier_not_in_use() from public;

create trigger suppliers_not_in_use before delete on public.suppliers
  for each row execute function app.supplier_not_in_use();

-- ---------------------------------------------------------------------------
-- Privileges + RLS (same as brands)
-- ---------------------------------------------------------------------------
alter table public.suppliers enable row level security;

revoke all on public.suppliers, public.supplier_usage from anon, authenticated;
grant all on public.suppliers, public.supplier_usage to service_role;
grant select, insert, delete on public.suppliers to authenticated;
grant select on public.supplier_usage to authenticated;

create policy "members read suppliers" on public.suppliers
  for select to authenticated using ((select app.is_member()));
create policy "members add suppliers" on public.suppliers
  for insert to authenticated with check ((select app.is_member()));
create policy "admins delete suppliers" on public.suppliers
  for delete to authenticated using ((select app.is_admin()));
