-- K2 · Customer keys for jobs (docs/PLAN.md §11).
--
-- A key is an 8-character code (K7M4QX9P, shown as K7M4-QX9P) that opens one customer page: for a job, the work
-- and the prices the customer is charged (never costs), their payments, the photos ticked "Customers can see"
-- (attachments.on_website: one tick for the website and for keys) and the invoice. K3 adds keys for cars.
-- Members make keys (create_access_key: the code is made here) and switch them off; a job can have several.
-- Customers open them through the files function (POST /files/key), which calls open_access_key() with the
-- service role: it checks the code every time, counts the openings and blocks an IP after 20 wrong codes in
-- 15 minutes.

create table public.access_keys (
  id uuid primary key default gen_random_uuid(),
  -- no 0/O, 1/I/L: easy to read out and type
  code text not null check (code ~ '^[2-9A-HJKMNP-Z]{8}$'),
  kind text not null check (kind in ('job', 'buyer', 'owner')),
  job_id uuid references public.jobs (id) on delete cascade,
  car_id uuid references public.cars (id) on delete cascade,
  note text check (note is null or (char_length(note) between 1 and 80 and note = btrim(note))),
  switched_off_at timestamptz,
  opened_count integer not null default 0,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint access_keys_target check (
    case kind when 'job' then job_id is not null and car_id is null else car_id is not null and job_id is null end
  )
);
create unique index access_keys_code_key on public.access_keys (code);
create index access_keys_job_idx on public.access_keys (job_id);
create index access_keys_car_idx on public.access_keys (car_id);

create trigger access_keys_audit before insert or update on public.access_keys
  for each row execute function app.stamp_audit();

alter table public.access_keys enable row level security;
revoke all on public.access_keys from anon, authenticated;
grant all on public.access_keys to service_role;
-- made only by create_access_key(); members may change the note and switch a key off (or on again)
grant select on public.access_keys to authenticated;
grant update (note, switched_off_at) on public.access_keys to authenticated;

create policy "members read keys" on public.access_keys
  for select to authenticated using ((select app.is_member()));
create policy "members change keys" on public.access_keys
  for update to authenticated using ((select app.is_member())) with check ((select app.is_member()));

-- ---------------------------------------------------------------------------
-- Making a key
-- ---------------------------------------------------------------------------
create function public.create_access_key(p_kind text, p_job_id uuid, p_car_id uuid, p_note text default null)
returns public.access_keys
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_bytes bytea;
  v_code text;
  v_ref text;
  v_row public.access_keys;
begin
  if not (select app.is_member()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_kind is distinct from 'job' then
    raise exception 'Keys can be made for jobs';
  end if;
  select j.ref into v_ref from public.jobs j where j.id = p_job_id;
  if not found then
    raise exception 'Job not found';
  end if;
  for attempt in 1..5 loop
    -- 8 random bytes: a v4 uuid is random except its version and variant bits (bytes 6 and 8)
    v_bytes := substring(uuid_send(gen_random_uuid()) from 1 for 6) || substring(uuid_send(gen_random_uuid()) from 10 for 2);
    v_code := '';
    for i in 0..7 loop
      v_code := v_code || substr(v_alphabet, get_byte(v_bytes, i) % 31 + 1, 1);
    end loop;
    begin
      insert into public.access_keys (code, kind, job_id, note)
      values (v_code, 'job', p_job_id, nullif(btrim(coalesce(p_note, '')), ''))
      returning * into v_row;
      perform app.log_activity('job', p_job_id, 'key', format('Made a customer key for %s', v_ref));
      return v_row;
    exception when unique_violation then
      null; -- that code is taken: draw another
    end;
  end loop;
  raise exception 'Could not make a new code. Try again.';
end;
$$;
revoke all on function public.create_access_key(text, uuid, uuid, text) from public, anon;
grant execute on function public.create_access_key(text, uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- What a job key shows. Customer prices only: no costs, purchases, suppliers, notes, shares or settlement.
-- ---------------------------------------------------------------------------
create function app.key_job_view(p_job_id uuid) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'kind', 'job',
    'job_id', j.id,
    'workshop', (
      select jsonb_build_object('name', s.workshop_name, 'address', s.address, 'phone', s.phone, 'email', s.email,
                                'logo', s.logo_data_url)
      from public.settings s
    ),
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object('name', c.name, 'phone', c.phone, 'call', c.call, 'whatsapp', c.whatsapp,
                                          'viber', c.viber) order by c.sort_order, c.created_at)
      from public.website_contacts c
    ), '[]'::jsonb),
    'job', jsonb_build_object(
      'ref', j.ref,
      'description', j.description,
      'status', j.status,
      'received_on', j.created_at::date,
      'done_on', j.done_on,
      'car_make', j.car_make,
      'car_model', j.car_model,
      'car_plate', j.car_plate,
      'labor_cents', j.labor_price_cents,
      'invoice_number', j.invoice_number,
      'invoice_date', j.invoice_date,
      'has_invoice', exists (
        select 1 from public.attachments a where a.entity_type = 'job' and a.entity_id = j.id and a.kind = 'invoice'
      ),
      'lines', coalesce((
        select jsonb_agg(jsonb_build_object('description', l.description, 'qty', l.qty, 'unit', l.unit,
                                            'price_cents', l.sale_price_cents) order by l.sort_order, l.created_at, l.id)
        from public.job_lines l
        where l.job_id = j.id
      ), '[]'::jsonb),
      'payments', coalesce((
        select jsonb_agg(jsonb_build_object('date', t.occurred_on, 'amount_cents', t.amount_cents)
                         order by t.occurred_on, t.created_at)
        from public.transactions t
        where t.job_id = j.id and t.category = 'job_payment'
      ), '[]'::jsonb)
    ),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'favorite', a.is_cover) order by a.created_at, a.id)
      from public.attachments a
      where a.entity_type = 'job' and a.entity_id = j.id and a.kind = 'photo' and a.on_website
    ), '[]'::jsonb)
  )
  from public.jobs j
  where j.id = p_job_id;
$$;
revoke all on function app.key_job_view(uuid) from public;

-- ---------------------------------------------------------------------------
-- Opening a key (the files function, service role only)
-- ---------------------------------------------------------------------------
create table app.key_attempts (
  ip text not null,
  at timestamptz not null default now()
);
create index key_attempts_ip_at_idx on app.key_attempts (ip, at);
revoke all on app.key_attempts from public;

-- What the key shows, or null when there's no such key or it is switched off. `p_count` false: a team member
-- looking at what the customer sees, which isn't counted as an opening.
create function public.open_access_key(p_code text, p_ip text default null, p_count boolean default true) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  v_key public.access_keys;
begin
  if p_ip is not null
     and (select count(*) from app.key_attempts k where k.ip = p_ip and k.at > now() - interval '15 minutes') >= 20 then
    raise exception 'Too many wrong codes. Try again in 15 minutes.' using hint = 'too_many';
  end if;

  select * into v_key from public.access_keys k where k.code = v_code and k.switched_off_at is null;
  if not found then
    if p_ip is not null then
      insert into app.key_attempts (ip) values (p_ip);
    end if;
    delete from app.key_attempts k where k.at < now() - interval '1 day';
    return null;
  end if;

  if p_count then
    update public.access_keys set opened_count = opened_count + 1, last_opened_at = now() where id = v_key.id;
  end if;
  return case v_key.kind when 'job' then app.key_job_view(v_key.job_id) end || jsonb_build_object('code', v_key.code);
end;
$$;
revoke all on function public.open_access_key(text, text, boolean) from public, anon, authenticated;
grant execute on function public.open_access_key(text, text, boolean) to service_role;
