-- K3 · Keys for cars and for the website; every key can have an end date (docs/PLAN.md §11).
--
--   buyer    one car, like its website page: photos, before/after, what we did, specs, the asking price while it is
--            for sale (a "sold" badge after); texts from its website listing when it has one
--   owner    one car's history: what we did, the parts fitted (names and dates, never prices), photos
--   website  the website, with what this key shows: sections, all cars or chosen ones, prices on/off.
--            "Public" is a website key without a name.
-- Hidden cars, sections and prices are left out here, in SQL, so a key never even receives them.

alter table public.access_keys
  add column expires_at timestamptz,
  add column shows jsonb;

alter table public.access_keys drop constraint access_keys_kind_check;
alter table public.access_keys add constraint access_keys_kind_check check (kind in ('job', 'buyer', 'owner', 'website'));
alter table public.access_keys drop constraint access_keys_target;
alter table public.access_keys add constraint access_keys_target check (
  case kind
    when 'job' then job_id is not null and car_id is null
    when 'website' then job_id is null and car_id is null
    else car_id is not null and job_id is null
  end
);
alter table public.access_keys add constraint access_keys_shows check ((kind = 'website') = (shows is not null));

-- members may also change the end date, what a website key shows, and buyer ↔ owner (the checks above keep a key
-- on its job, car or the website)
grant update (note, switched_off_at, expires_at, shows, kind) on public.access_keys to authenticated;

-- what a website key shows, always in the same shape:
--   { sections: [for_sale, work, services, about, reviews, contact], cars: all | chosen, car_ids: [website_cars.id], prices: bool }
create function app.clean_key_shows() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_all constant text[] := array['for_sale', 'work', 'services', 'about', 'reviews', 'contact'];
begin
  if new.kind <> 'website' then
    new.shows := null;
    return new;
  end if;
  new.shows := jsonb_build_object(
    'sections', coalesce((
      select jsonb_agg(x order by array_position(v_all, x))
      from (
        select distinct x
        from jsonb_array_elements_text(case when jsonb_typeof(new.shows -> 'sections') = 'array' then new.shows -> 'sections' else to_jsonb(v_all) end) x
        where x = any(v_all)
      ) s
    ), '[]'::jsonb),
    'cars', case when new.shows ->> 'cars' = 'chosen' then 'chosen' else 'all' end,
    'car_ids', case when new.shows ->> 'cars' = 'chosen' and jsonb_typeof(new.shows -> 'car_ids') = 'array' then coalesce((
      select jsonb_agg(distinct x)
      from jsonb_array_elements_text(new.shows -> 'car_ids') x
      where x ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ), '[]'::jsonb) else '[]'::jsonb end,
    'prices', coalesce(new.shows -> 'prices', 'true'::jsonb) <> 'false'::jsonb
  );
  return new;
end;
$$;

create trigger access_keys_shows before insert or update on public.access_keys
  for each row execute function app.clean_key_shows();

-- ---------------------------------------------------------------------------
-- Making a key (replaces K2's job-only version)
-- ---------------------------------------------------------------------------
drop function public.create_access_key(text, uuid, uuid, text);

create function public.create_access_key(
  p_kind text,
  p_job_id uuid default null,
  p_car_id uuid default null,
  p_note text default null,
  p_expires_at timestamptz default null,
  p_shows jsonb default null
) returns public.access_keys
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_bytes bytea;
  v_code text;
  v_ref text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_row public.access_keys;
begin
  if not (select app.is_member()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_kind = 'job' then
    select j.ref into v_ref from public.jobs j where j.id = p_job_id;
    if not found then
      raise exception 'Job not found';
    end if;
  elsif p_kind in ('buyer', 'owner') then
    select c.ref into v_ref from public.cars c where c.id = p_car_id;
    if not found then
      raise exception 'Car not found';
    end if;
  elsif p_kind is distinct from 'website' then
    raise exception 'Unknown kind of key';
  end if;

  for attempt in 1..5 loop
    -- 8 random bytes: a v4 uuid is random except its version and variant bits (bytes 6 and 8)
    v_bytes := substring(uuid_send(gen_random_uuid()) from 1 for 6) || substring(uuid_send(gen_random_uuid()) from 10 for 2);
    v_code := '';
    for i in 0..7 loop
      v_code := v_code || substr(v_alphabet, get_byte(v_bytes, i) % 31 + 1, 1);
    end loop;
    begin
      insert into public.access_keys (code, kind, job_id, car_id, note, expires_at, shows)
      values (
        v_code, p_kind,
        case when p_kind = 'job' then p_job_id end,
        case when p_kind in ('buyer', 'owner') then p_car_id end,
        v_note, p_expires_at,
        case when p_kind = 'website' then coalesce(p_shows, '{}'::jsonb) end
      )
      returning * into v_row;
      case p_kind
        when 'job' then
          perform app.log_activity('job', p_job_id, 'key', format('Made a customer key for %s', v_ref));
        when 'website' then
          perform app.log_activity('website', null, 'key', coalesce('Made a website key for ' || v_note, 'Made a public website key'));
        else
          perform app.log_activity('car', p_car_id, 'key', format('Made %s key for %s', case p_kind when 'buyer' then 'a buyer' else 'an owner' end, v_ref));
      end case;
      return v_row;
    exception when unique_violation then
      null; -- that code is taken: draw another
    end;
  end loop;
  raise exception 'Could not make a new code. Try again.';
end;
$$;
revoke all on function public.create_access_key(text, uuid, uuid, text, timestamptz, jsonb) from public, anon;
grant execute on function public.create_access_key(text, uuid, uuid, text, timestamptz, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- What car keys show. Never: what the car cost, its costs, seller or buyer, VIN, notes, money, shares.
-- ---------------------------------------------------------------------------
create function app.key_contacts() returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'workshop', (
      select jsonb_build_object('name', s.workshop_name, 'address', s.address, 'phone', s.phone, 'email', s.email,
                                'logo', s.logo_data_url)
      from public.settings s
    ),
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object('name', c.name, 'phone', c.phone, 'call', c.call, 'whatsapp', c.whatsapp,
                                          'viber', c.viber) order by c.sort_order, c.created_at)
      from public.website_contacts c
    ), '[]'::jsonb)
  );
$$;
revoke all on function app.key_contacts() from public;

create function app.key_car_view(p_car_id uuid, p_kind text) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select app.key_contacts() || jsonb_build_object(
    'kind', p_kind,
    -- shaped like a website car (site/src/types.ts SiteCar), so the car page draws it
    'car', jsonb_build_object(
      'id', c.id,
      'slug', coalesce(wc.slug, 'auto'),
      'kind', 'flip',
      'status', c.status,
      'title_hr', coalesce(wc.title_hr, nullif(concat_ws(' ', c.make, c.model, c.generation), ''), c.ref),
      'title_en', wc.title_en,
      'summary_hr', wc.summary_hr,
      'summary_en', wc.summary_en,
      'story_hr', wc.story_hr,
      'story_en', wc.story_en,
      'make', c.make,
      'model', c.model,
      'generation', c.generation,
      'year', case when coalesce(wc.show_year, true) then c.year end,
      'engine', case when coalesce(wc.show_engine, true) then c.engine end,
      'fuel', case when coalesce(wc.show_fuel, true) then c.fuel end,
      'mileage_km', case when coalesce(wc.show_mileage, true) then coalesce(c.sale_mileage_km, c.mileage_km) end,
      -- the asking price, for a buyer and only while the car is for sale
      'price_cents', case when p_kind = 'buyer' and c.status = 'listed' then c.asking_price_cents end,
      'plate', case when p_kind = 'owner' then c.plate end,
      'pinned', false,
      'photos', coalesce((
        select jsonb_agg(jsonb_build_object('id', a.id, 'favorite', a.is_cover) order by a.created_at, a.id)
        from public.attachments a
        where a.entity_type = 'car' and a.entity_id = c.id and a.kind = 'photo' and a.on_website
      ), '[]'::jsonb),
      'pairs', coalesce((
        select jsonb_agg(jsonb_build_object('before', wp.before_photo_id, 'after', wp.after_photo_id) order by wp.sort_order, wp.created_at)
        from public.website_pairs wp
        where wp.website_car_id = wc.id
      ), '[]'::jsonb)
    ),
    -- the owner's list of parts: bought for the car, and taken from stock (less what went back)
    'parts', case when p_kind = 'owner' then coalesce((
      select jsonb_agg(p.part order by p.on_date, p.part ->> 'description')
      from (
        select t.occurred_on as on_date,
               jsonb_build_object('date', t.occurred_on, 'description', t.description, 'qty', null, 'unit', null) as part
        from public.transactions t
        where t.car_id = c.id and t.category = 'car_part'
        union all
        select max(m.occurred_on),
               jsonb_build_object('date', max(m.occurred_on), 'description', i.name, 'qty', -sum(m.qty_delta), 'unit', u.name)
        from public.stock_movements m
        join public.items i on i.id = m.item_id
        left join public.units u on u.id = i.unit_id
        where m.car_id = c.id and m.type in ('use_car', 'return')
        group by i.id, i.name, u.name
        having -sum(m.qty_delta) > 0
      ) p
    ), '[]'::jsonb) else '[]'::jsonb end
  )
  from public.cars c
  left join public.website_cars wc on wc.car_id = c.id
  where c.id = p_car_id;
$$;
revoke all on function app.key_car_view(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- What a website key shows: the website (website_snapshot) without what this key hides
-- ---------------------------------------------------------------------------
create function app.key_website_view(p_shows jsonb) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_snap jsonb := public.website_snapshot();
  v_sections jsonb := coalesce(p_shows -> 'sections', '[]'::jsonb);
  v_prices boolean := coalesce(p_shows -> 'prices', 'true'::jsonb) <> 'false'::jsonb;
  v_cars jsonb;
begin
  select coalesce(jsonb_agg(case when v_prices then c.car else c.car || jsonb_build_object('price_cents', null) end order by c.n), '[]'::jsonb)
  into v_cars
  from jsonb_array_elements(v_snap -> 'cars') with ordinality as c(car, n)
  where (p_shows ->> 'cars' is distinct from 'chosen' or coalesce(p_shows -> 'car_ids', '[]'::jsonb) ? (c.car ->> 'id'))
    and v_sections ? (case when c.car ->> 'kind' = 'flip' and c.car ->> 'status' = 'listed' then 'for_sale' else 'work' end);

  return v_snap || jsonb_build_object(
    'kind', 'website',
    'cars', v_cars,
    'services', case when v_sections ? 'services' then v_snap -> 'services' else '[]'::jsonb end,
    'reviews', case when v_sections ? 'reviews' then v_snap -> 'reviews' else '[]'::jsonb end,
    'hours', case when v_sections ? 'contact' then v_snap -> 'hours' else '[]'::jsonb end,
    'site', case when v_sections ? 'about' then v_snap -> 'site'
                 else (v_snap -> 'site') || jsonb_build_object('about_hr', null, 'about_en', null) end,
    -- without "about us" only the big photo at the top stays
    'site_photos', case when v_sections ? 'about' then v_snap -> 'site_photos' else coalesce((
      select jsonb_agg(p) from jsonb_array_elements(v_snap -> 'site_photos') p where (p ->> 'favorite')::boolean
    ), '[]'::jsonb) end,
    'hidden', (
      select coalesce(jsonb_agg(x), '[]'::jsonb)
      from unnest(array['for_sale', 'work', 'services', 'about', 'reviews', 'contact']) x
      where not v_sections ? x
    )
  );
end;
$$;
revoke all on function app.key_website_view(jsonb) from public;

-- ---------------------------------------------------------------------------
-- Opening a key: also checks the end date, and shows every kind
-- ---------------------------------------------------------------------------
create or replace function public.open_access_key(p_code text, p_ip text default null, p_count boolean default true) returns jsonb
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

  select * into v_key
  from public.access_keys k
  where k.code = v_code and k.switched_off_at is null and (k.expires_at is null or k.expires_at > now());
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
  return case v_key.kind
    when 'job' then app.key_job_view(v_key.job_id)
    when 'website' then app.key_website_view(v_key.shows)
    else app.key_car_view(v_key.car_id, v_key.kind)
  end || jsonb_build_object('code', v_key.code, 'expires_at', v_key.expires_at);
end;
$$;
