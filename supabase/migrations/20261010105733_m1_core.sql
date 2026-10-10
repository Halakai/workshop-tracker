-- M1 · core: users = partners, money accounts, workshop settings, activity log, RLS helpers.
--
-- Security model (applies to every table in this app):
--   * anon (signed out) gets no privileges at all.
--   * authenticated users only see data when they have an ACTIVE row in public.profiles
--     (app.is_member()). Being signed in is not enough.
--   * admin-only actions go through the admin-users Edge Function (secret key, server side).

-- ---------------------------------------------------------------------------
-- Private helper schema (not exposed through the Data API)
-- ---------------------------------------------------------------------------
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- Objects created by future migrations: nothing for anon, functions not executable by default.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'member');
create type public.account_kind as enum ('wallet', 'partner', 'external');

-- ---------------------------------------------------------------------------
-- Audit columns: created_by/updated_by come from the JWT and can't be faked by the client.
-- Edge Functions (secret key, no auth.uid()) pass created_by/updated_by explicitly.
-- ---------------------------------------------------------------------------
create function app.stamp_audit() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
    new.updated_at := new.created_at;
    new.updated_by := new.created_by;
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    if auth.uid() is not null then
      new.updated_by := auth.uid();
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles: every user of the app is also a partner
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  email text not null,
  role public.user_role not null default 'member',
  is_active boolean not null default true,
  -- default profit share in basis points (5000 = 50.00 %)
  default_share_bp integer not null default 0 check (default_share_bp between 0 and 10000),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

create trigger profiles_audit before insert or update on public.profiles
  for each row execute function app.stamp_audit();

-- ---------------------------------------------------------------------------
-- Money accounts: one wallet, one "external" (the outside world), one per partner
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  kind public.account_kind not null,
  partner_id uuid unique references public.profiles (id),
  name text,
  created_at timestamptz not null default now(),
  constraint accounts_partner_link check ((kind = 'partner') = (partner_id is not null)),
  constraint accounts_name check (kind = 'partner' or name is not null)
);

create unique index accounts_single_wallet_and_external on public.accounts (kind) where kind <> 'partner';

insert into public.accounts (kind, name) values
  ('wallet', 'Workshop wallet'),
  ('external', 'External');

create function app.create_partner_account() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.accounts (kind, partner_id) values ('partner', new.id);
  return new;
end;
$$;

create trigger profiles_partner_account after insert on public.profiles
  for each row execute function app.create_partner_account();

-- ---------------------------------------------------------------------------
-- Workshop settings (single row): shown on invoices
-- ---------------------------------------------------------------------------
create table public.settings (
  id boolean primary key default true check (id),
  workshop_name text not null default 'Our workshop' check (char_length(btrim(workshop_name)) between 1 and 100),
  address text,
  phone text,
  email text,
  website text,
  iban text,
  -- small resized logo as a data: URL so the PDF generator can always load it
  logo_data_url text check (logo_data_url is null or char_length(logo_data_url) <= 400000),
  invoice_title text not null default 'Invoice',
  invoice_footer text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

create trigger settings_audit before insert or update on public.settings
  for each row execute function app.stamp_audit();

insert into public.settings default values;

-- ---------------------------------------------------------------------------
-- Activity log ("recent activity" on the dashboard)
-- ---------------------------------------------------------------------------
create table public.activity_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid references public.profiles (id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  summary text not null
);

create index activity_log_at_idx on public.activity_log (at desc);

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------
create function app.is_member() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active
  );
$$;

create function app.is_admin() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active and p.role = 'admin'
  );
$$;

revoke all on function app.is_member() from public;
revoke all on function app.is_admin() from public;
grant execute on function app.is_member() to authenticated, service_role;
grant execute on function app.is_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Privileges + Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.settings enable row level security;
alter table public.activity_log enable row level security;

revoke all on public.profiles, public.accounts, public.settings, public.activity_log from anon, authenticated;
grant all on public.profiles, public.accounts, public.settings, public.activity_log to service_role;

grant select on public.profiles, public.accounts, public.settings, public.activity_log to authenticated;
-- members may only rename themselves; role, active flag and shares change via the admin-users function
grant update (display_name) on public.profiles to authenticated;
grant update (workshop_name, address, phone, email, website, iban, logo_data_url, invoice_title, invoice_footer)
  on public.settings to authenticated;

create policy "members read profiles" on public.profiles
  for select to authenticated using ((select app.is_member()));

create policy "members rename themselves" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and (select app.is_member()))
  with check (id = (select auth.uid()));

create policy "members read accounts" on public.accounts
  for select to authenticated using ((select app.is_member()));

create policy "members read settings" on public.settings
  for select to authenticated using ((select app.is_member()));

create policy "admins update settings" on public.settings
  for update to authenticated
  using ((select app.is_admin()))
  with check ((select app.is_admin()));

create policy "members read activity" on public.activity_log
  for select to authenticated using ((select app.is_member()));

-- ---------------------------------------------------------------------------
-- Default profit shares: replaced all at once so they always add up to 100 %.
-- Called only by the admin-users Edge Function (service role).
-- ---------------------------------------------------------------------------
create function public.admin_set_default_shares(p_actor uuid, p_shares jsonb) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
begin
  select coalesce(sum((s ->> 'share_bp')::integer), 0) into v_total
  from jsonb_array_elements(p_shares) s;

  if v_total <> 10000 then
    raise exception 'Shares must add up to 100 %% (got % basis points)', v_total;
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_shares) s
    left join public.profiles p on p.id = (s ->> 'user_id')::uuid
    where p.id is null
  ) then
    raise exception 'Unknown user in shares';
  end if;

  update public.profiles p
  set default_share_bp = coalesce((
        select (s ->> 'share_bp')::integer
        from jsonb_array_elements(p_shares) s
        where (s ->> 'user_id')::uuid = p.id
      ), 0),
      updated_by = p_actor
  where true;
end;
$$;

revoke all on function public.admin_set_default_shares(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_set_default_shares(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- One-time bootstrap: run in the Supabase SQL editor after creating your own user
--   select app.bootstrap_admin('you@example.com', 'Your name');
-- Works only while there is no admin yet.
-- ---------------------------------------------------------------------------
create function app.bootstrap_admin(p_email text, p_display_name text default null) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_email text;
begin
  if exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'An admin already exists. Manage users in the app: More → Users.';
  end if;

  select u.id, u.email into v_user_id, v_email
  from auth.users u
  where lower(u.email) = lower(btrim(p_email));

  if v_user_id is null then
    raise exception 'No user with email %. Create it first: Authentication → Users → Add user.', p_email;
  end if;

  insert into public.profiles (id, display_name, email, role, default_share_bp)
  values (v_user_id, coalesce(nullif(btrim(p_display_name), ''), split_part(v_email, '@', 1)), v_email, 'admin', 10000);

  insert into public.activity_log (actor_id, entity_type, entity_id, action, summary)
  values (v_user_id, 'profile', v_user_id, 'bootstrap', 'Set up as the first admin');

  return format('Done: %s is now the admin. Sign in to the app.', v_email);
end;
$$;

revoke all on function app.bootstrap_admin(text, text) from public, authenticated, service_role;
