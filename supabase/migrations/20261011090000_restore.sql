-- Restoring a backup (More → Backup & restore): replaces all workshop data with the backup's.
--
-- A backup is the JSON file the export page makes: { app: 'workshop-tracker', exported_at, tables: { name: [rows] } }.
-- The app maps the people in the backup to users that exist here before it sends the file, so every
-- created_by / partner_id in it points at a real user. Users themselves (profiles) are never restored.

-- ---------------------------------------------------------------------------
-- Which tables a backup holds, parents before children: every public table members can read,
-- except profiles. Tables added later are included automatically.
-- ---------------------------------------------------------------------------
create function app.backup_tables() returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  v_left text[];
  v_done text[] := '{}';
  v_next text[];
begin
  select coalesce(array_agg(c.relname::text order by c.relname), '{}') into v_left
  from pg_catalog.pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relkind = 'r'
    and c.relname <> 'profiles'
    and pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT');

  while cardinality(v_left) > 0 loop
    -- tables whose parents (within the set) are all placed already
    select array_agg(t order by t) into v_next
    from unnest(v_left) t
    where not exists (
      select 1
      from pg_catalog.pg_constraint k
      join pg_catalog.pg_class child on child.oid = k.conrelid
      join pg_catalog.pg_class parent on parent.oid = k.confrelid
      where k.contype = 'f'
        and child.relnamespace = 'public'::regnamespace
        and child.relname = t
        and parent.relnamespace = 'public'::regnamespace
        and parent.relname <> t
        and parent.relname = any(v_left)
    );
    if v_next is null then
      raise exception 'Tables refer to each other in a circle: %', v_left;
    end if;
    v_done := v_done || v_next;
    v_left := array(select t from unnest(v_left) t where t <> all(v_next));
  end loop;
  return v_done;
end;
$$;

create function public.backup_tables() returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select app.is_member()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return app.backup_tables();
end;
$$;

-- ---------------------------------------------------------------------------
-- Restore (admins only). All or nothing: any error rolls the whole restore back.
-- ---------------------------------------------------------------------------
create function public.admin_restore(p_backup jsonb) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tables text[];
  v_table text;
  v_column text;
  v_rows jsonb;
  v_columns text;
  v_missing text;
  v_counts jsonb := '{}';
begin
  if not (select app.is_admin()) then
    raise exception 'Only an admin can restore a backup' using errcode = '42501';
  end if;
  if p_backup ->> 'app' is distinct from 'workshop-tracker' or jsonb_typeof(p_backup -> 'tables') is distinct from 'object' then
    raise exception 'This file is not a Workshop Tracker backup';
  end if;
  if jsonb_typeof(p_backup -> 'tables' -> 'accounts') is distinct from 'array' then
    raise exception 'This backup has no money accounts, so it is not complete';
  end if;

  -- everyone in the backup must be a user here
  select string_agg(coalesce(p ->> 'display_name', p ->> 'id'), ', ') into v_missing
  from jsonb_array_elements(coalesce(p_backup -> 'tables' -> 'profiles', '[]')) p
  where not exists (select 1 from public.profiles x where x.id::text = p ->> 'id');
  if v_missing is not null then
    raise exception 'These people from the backup are not users here: %. Create them first (More → Users & partners).', v_missing;
  end if;

  -- the tables this backup has, parents first (tables it doesn't have are left as they are)
  select coalesce(array_agg(t order by o), '{}') into v_tables
  from unnest(app.backup_tables()) with ordinality as u(t, o)
  where jsonb_typeof(p_backup -> 'tables' -> t) = 'array';

  -- rows go back exactly as they were (ids, who and when): switch off the triggers that stamp, log and check
  foreach v_table in array v_tables loop
    execute format('alter table public.%I disable trigger user', v_table);
  end loop;

  execute 'truncate table ' || (select string_agg(format('public.%I', t), ', ') from unnest(v_tables) t) || ' cascade';

  foreach v_table in array v_tables loop
    v_rows := p_backup -> 'tables' -> v_table;
    if jsonb_array_length(v_rows) > 0 then
      -- only the columns the backup has: newer columns get their defaults, removed ones are ignored
      select string_agg(format('%I', a.attname), ', ' order by a.attnum) into v_columns
      from pg_catalog.pg_attribute a
      where a.attrelid = format('public.%I', v_table)::regclass
        and a.attnum > 0
        and not a.attisdropped
        and a.attgenerated = ''
        and (v_rows -> 0) ? a.attname;
      execute format(
        'insert into public.%I (%s) overriding system value select %s from jsonb_populate_recordset(null::public.%I, $1)',
        v_table, v_columns, v_columns, v_table
      ) using v_rows;
    end if;
    v_counts := v_counts || jsonb_build_object(v_table, jsonb_array_length(v_rows));
  end loop;

  foreach v_table in array v_tables loop
    execute format('alter table public.%I enable trigger user', v_table);
  end loop;

  -- identity numbers continue after the restored rows
  for v_table, v_column in
    select c.relname, a.attname
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    where c.relnamespace = 'public'::regnamespace and a.attidentity <> '' and c.relname = any(v_tables)
  loop
    execute format(
      'select setval(pg_get_serial_sequence(%L, %L), coalesce(max(%I), 0) + 1, false) from public.%I',
      'public.' || v_table, v_column, v_column, v_table
    );
  end loop;

  -- things every workshop needs, whatever the backup had
  insert into public.accounts (kind, name)
  select 'wallet', 'Workshop wallet' where not exists (select 1 from public.accounts where kind = 'wallet');
  insert into public.accounts (kind, name)
  select 'external', 'External' where not exists (select 1 from public.accounts where kind = 'external');
  insert into public.accounts (kind, partner_id)
  select 'partner', p.id from public.profiles p
  where not exists (select 1 from public.accounts a where a.partner_id = p.id);
  insert into public.settings default values on conflict do nothing;

  -- invoice numbering carries on from the restored invoices (2026-007 → next is 2026-008)
  delete from public.counters where name like 'invoice-%';
  insert into public.counters (name, value)
  select 'invoice-' || left(invoice_number, 4), max(substring(invoice_number from 6)::integer)
  from public.jobs
  where invoice_number ~ '^[0-9]{4}-[0-9]+$'
  group by left(invoice_number, 4);

  perform app.log_activity(
    'backup', null, 'restore',
    'Restored the backup from ' || coalesce(to_char((p_backup ->> 'exported_at')::timestamptz, 'DD.MM.YYYY'), 'an unknown date')
  );
  return v_counts;
end;
$$;

revoke all on function app.backup_tables() from public;
revoke all on function public.backup_tables() from public, anon;
revoke all on function public.admin_restore(jsonb) from public, anon;
grant execute on function public.backup_tables() to authenticated;
grant execute on function public.admin_restore(jsonb) to authenticated;
