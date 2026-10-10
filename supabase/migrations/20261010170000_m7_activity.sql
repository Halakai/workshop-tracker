-- M7 · recent activity for cars, jobs and money; backup reminder; keep-alive ping.

-- money in activity texts like in the app: 1 500.00€ (non-breaking space between thousands)
create or replace function app.fmt_eur(p_cents bigint) returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_cents < 0 then '-' else '' end
    || regexp_replace((abs(p_cents) / 100)::text, '(\d)(?=(\d{3})+$)', '\1' || chr(160), 'g')
    || '.' || lpad((abs(p_cents) % 100)::text, 2, '0') || '€';
$$;

-- "Wallet", a partner's name, or "outside"
create function app.account_label(p_account_id uuid) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case a.kind when 'wallet' then 'Wallet' when 'external' then 'outside' else coalesce(p.display_name, 'partner') end
  from public.accounts a left join public.profiles p on p.id = a.partner_id
  where a.id = p_account_id;
$$;
revoke all on function app.account_label(uuid) from public;

create function app.log_car_activity() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform app.log_activity('car', new.id, 'add', format('Added %s %s', new.ref, concat_ws(' ', new.year, new.make, new.model)));
  elsif new.status is distinct from old.status then
    perform app.log_activity('car', new.id, 'status', format('%s is now %s', new.ref, replace(new.status::text, '_', ' ')));
  end if;
  return new;
end;
$$;

create trigger cars_activity after insert or update of status on public.cars
  for each row execute function app.log_car_activity();

create function app.log_job_activity() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer text;
begin
  select c.name into v_customer from public.contacts c where c.id = new.customer_id;
  if tg_op = 'INSERT' then
    perform app.log_activity('job', new.id, 'add', format('New job %s for %s', new.ref, v_customer));
  elsif new.status is distinct from old.status then
    perform app.log_activity('job', new.id, 'status', format('%s (%s) is now %s', new.ref, v_customer, new.status));
  end if;
  return new;
end;
$$;

create trigger jobs_activity after insert or update of status on public.jobs
  for each row execute function app.log_job_activity();

-- ledger entries not already logged elsewhere (stock purchases, workshop money and settlements are)
create function app.log_money_activity() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from text := app.account_label(new.from_account_id);
  v_to text := app.account_label(new.to_account_id);
  v_amount text := app.fmt_eur(new.amount_cents);
  v_ref text;
  v_cost text;
begin
  if new.category in ('stock_purchase', 'workshop_expense', 'other_income', 'settlement') then
    return new;
  end if;
  select c.ref into v_ref from public.cars c where c.id = new.car_id;
  if v_ref is null then
    select j.ref into v_ref from public.jobs j where j.id = new.job_id;
  end if;
  select e.name into v_cost from public.expense_categories e where e.id = new.expense_category_id;

  perform app.log_activity(
    case when new.car_id is not null then 'car' when new.job_id is not null then 'job' else 'transaction' end,
    coalesce(new.car_id, new.job_id, new.id),
    new.category,
    case new.category
      when 'deposit' then format('%s put %s into the wallet', v_from, v_amount)
      when 'withdrawal' then format('%s took %s out of the wallet', v_to, v_amount)
      when 'transfer' then format('Transfer %s → %s: %s', v_from, v_to, v_amount)
      when 'car_purchase' then format('Bought %s for %s (paid by %s)', v_ref, v_amount, v_from)
      when 'car_part' then format('%s: part %s for %s (paid by %s)', v_ref, coalesce(new.description, ''), v_amount, v_from)
      when 'car_cost' then format('%s: %s %s (paid by %s)', v_ref, concat_ws(' ', v_cost, new.description), v_amount, v_from)
      when 'car_sale' then format('Sold %s for %s (to %s)', v_ref, v_amount, v_to)
      when 'job_part' then format('%s: part %s for %s (paid by %s)', v_ref, coalesce(new.description, ''), v_amount, v_from)
      when 'job_payment' then format('%s: customer paid %s (to %s)', v_ref, v_amount, v_to)
      else format('%s %s', new.category, v_amount)
    end
  );
  return new;
end;
$$;

create trigger transactions_activity after insert on public.transactions
  for each row execute function app.log_money_activity();

-- backup reminder: when the last export was made
alter table public.settings add column last_export_at timestamptz;
grant update (last_export_at) on public.settings to authenticated;

-- A harmless ping for the GitHub Actions keep-alive (free projects pause after a week without activity).
-- It reads nothing; it is the only thing a signed-out caller may run.
create function public.keepalive() returns boolean
language sql
stable
set search_path = ''
as $$
  select true;
$$;
grant execute on function public.keepalive() to anon, authenticated;
