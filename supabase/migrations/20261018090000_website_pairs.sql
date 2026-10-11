-- Before/after pairs are picked by hand: any two photos of the car or job, in the order chosen, also photos that
-- are not in the website's gallery (they are then shown only in the slider). Pairs are saved all at once with
-- set_website_pairs(); members read them but don't write the table directly.

create table public.website_pairs (
  id uuid primary key default gen_random_uuid(),
  website_car_id uuid not null references public.website_cars (id) on delete cascade,
  before_photo_id uuid not null references public.attachments (id) on delete cascade,
  after_photo_id uuid not null references public.attachments (id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint website_pairs_two_photos check (before_photo_id <> after_photo_id)
);
create index website_pairs_car_idx on public.website_pairs (website_car_id, sort_order);
create index website_pairs_before_idx on public.website_pairs (before_photo_id);
create index website_pairs_after_idx on public.website_pairs (after_photo_id);

create trigger website_pairs_audit before insert or update on public.website_pairs
  for each row execute function app.stamp_audit();

alter table public.website_pairs enable row level security;
revoke all on public.website_pairs from anon, authenticated;
grant all on public.website_pairs to service_role;
grant select on public.website_pairs to authenticated;
create policy "members read website pairs" on public.website_pairs
  for select to authenticated using ((select app.is_member()));

-- ---------------------------------------------------------------------------
-- set_website_pairs: replaces a listing's pairs. p_pairs = [{"before": <photo id>, "after": <photo id>}, …]
-- ---------------------------------------------------------------------------
create function public.set_website_pairs(p_website_car_id uuid, p_pairs jsonb) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_car public.website_cars%rowtype;
  v_type text;
  v_id uuid;
  v_pair jsonb;
  v_before uuid;
  v_after uuid;
  v_n integer := 0;
begin
  if not (select app.is_member()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_car from public.website_cars where id = p_website_car_id for update;
  if not found then
    raise exception 'This car or job is not on the website';
  end if;
  if jsonb_typeof(p_pairs) is distinct from 'array' or jsonb_array_length(p_pairs) > 50 then
    raise exception 'Send a list of at most 50 pairs';
  end if;
  v_type := case when v_car.car_id is not null then 'car' else 'job' end;
  v_id := coalesce(v_car.car_id, v_car.job_id);

  delete from public.website_pairs where website_car_id = v_car.id;
  for v_pair in select value from jsonb_array_elements(p_pairs) loop
    v_before := (v_pair ->> 'before')::uuid;
    v_after := (v_pair ->> 'after')::uuid;
    if v_before is null or v_after is null or v_before = v_after then
      raise exception 'A pair needs two different photos';
    end if;
    if (select count(*) from public.attachments a
        where a.id in (v_before, v_after) and a.kind = 'photo' and a.entity_type = v_type and a.entity_id = v_id) <> 2 then
      raise exception 'The before and after photos must be photos of this %', v_type;
    end if;
    v_n := v_n + 1;
    insert into public.website_pairs (website_car_id, before_photo_id, after_photo_id, sort_order)
    values (v_car.id, v_before, v_after, v_n);
  end loop;
end;
$$;

revoke all on function public.set_website_pairs(uuid, jsonb) from public, anon;
grant execute on function public.set_website_pairs(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- What the website is built from: the gallery (photos on the website) and the pairs
-- ---------------------------------------------------------------------------
create or replace function public.website_snapshot() returns jsonb
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
    'site', (
      select jsonb_build_object('headline_hr', w.headline_hr, 'headline_en', w.headline_en, 'intro_hr', w.intro_hr,
                                'intro_en', w.intro_en, 'about_hr', w.about_hr, 'about_en', w.about_en,
                                'hours_note_hr', w.hours_note_hr, 'hours_note_en', w.hours_note_en,
                                'map_url', w.map_url, 'instagram_url', w.instagram_url, 'facebook_url', w.facebook_url)
      from public.website_settings w
    ),
    'site_photos', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'favorite', a.is_cover) order by a.created_at, a.id)
      from public.attachments a
      join public.website_settings w on a.entity_type = 'website' and a.entity_id = w.photos_id
      where a.kind = 'photo'
    ), '[]'::jsonb),
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object('name', c.name, 'phone', c.phone, 'call', c.call, 'whatsapp', c.whatsapp,
                                          'viber', c.viber) order by c.sort_order, c.created_at)
      from public.website_contacts c
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object('title_hr', v.title_hr, 'title_en', v.title_en, 'text_hr', v.text_hr,
                                          'text_en', v.text_en) order by v.sort_order, v.created_at)
      from public.website_services v
    ), '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object('author', r.author, 'stars', r.stars, 'text_hr', r.text_hr, 'text_en', r.text_en)
                       order by r.sort_order, r.created_at)
      from public.website_reviews r
    ), '[]'::jsonb),
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'opens', to_char(h.opens, 'HH24:MI'),
                                          'closes', to_char(h.closes, 'HH24:MI')) order by h.weekday)
      from public.website_hours h
    ), '[]'::jsonb),
    'cars', coalesce((
      select jsonb_agg(x.car order by x.pinned desc, x.finished desc, x.created_at desc)
      from (
        select
          wc.pinned,
          wc.created_at,
          coalesce(c.sale_date, c.status_changed_at::date, j.done_on, j.created_at::date) as finished,
          jsonb_build_object(
            'id', wc.id,
            'slug', wc.slug,
            'kind', case when wc.car_id is not null then 'flip' else 'job' end,
            'status', c.status,
            'title_hr', wc.title_hr,
            'title_en', wc.title_en,
            'summary_hr', wc.summary_hr,
            'summary_en', wc.summary_en,
            'story_hr', wc.story_hr,
            'story_en', wc.story_en,
            'make', coalesce(c.make, j.car_make),
            'model', coalesce(c.model, j.car_model),
            'generation', coalesce(c.generation, j.car_generation),
            'year', case when wc.show_year then coalesce(c.year, j.car_year) end,
            'engine', case when wc.show_engine then coalesce(c.engine, j.car_engine) end,
            'fuel', case when wc.show_fuel then c.fuel end,
            'mileage_km', case when wc.show_mileage then coalesce(c.sale_mileage_km, c.mileage_km) end,
            -- the asking price, only while the car is for sale
            'price_cents', case when c.status = 'listed' then c.asking_price_cents end,
            'pinned', wc.pinned,
            -- the gallery: chosen photos in the order they were added (the website puts the favorite first itself)
            'photos', coalesce((
              select jsonb_agg(jsonb_build_object('id', a.id, 'favorite', a.is_cover) order by a.created_at, a.id)
              from public.attachments a
              where a.kind = 'photo' and a.on_website
                and a.entity_type = case when wc.car_id is not null then 'car' else 'job' end
                and a.entity_id = coalesce(wc.car_id, wc.job_id)
            ), '[]'::jsonb),
            -- the before/after sliders, in the order picked
            'pairs', coalesce((
              select jsonb_agg(jsonb_build_object('before', wp.before_photo_id, 'after', wp.after_photo_id)
                               order by wp.sort_order, wp.created_at)
              from public.website_pairs wp
              where wp.website_car_id = wc.id
            ), '[]'::jsonb)
          ) as car
        from public.website_cars wc
        left join public.cars c on c.id = wc.car_id
        left join public.jobs j on j.id = wc.job_id
        where app.website_car_is_public(wc)
      ) x
    ), '[]'::jsonb)
  );
$$;

-- a photo in a before/after pair of a published car is on the website too, even when it isn't in the gallery
create or replace function public.website_photo(p_attachment_id uuid) returns table (drive_file_id text, mime_type text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.drive_file_id, a.mime_type
  from public.attachments a
  where a.id = p_attachment_id
    and a.kind = 'photo'
    and (
      (a.entity_type = 'website' and a.entity_id = (select w.photos_id from public.website_settings w))
      or (a.on_website and exists (
        select 1 from public.website_cars wc
        where app.website_car_is_public(wc)
          and ((a.entity_type = 'car' and wc.car_id = a.entity_id) or (a.entity_type = 'job' and wc.job_id = a.entity_id))
      ))
      or exists (
        select 1 from public.website_pairs wp
        join public.website_cars wc on wc.id = wp.website_car_id
        where app.website_car_is_public(wc) and a.id in (wp.before_photo_id, wp.after_photo_id)
      )
    );
$$;
