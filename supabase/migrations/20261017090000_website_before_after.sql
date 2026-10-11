-- Before/after on the website come from the photo albums: a car's chosen photos in the "Before" album are paired
-- with those in the "After" album, in the order they were added (1st with 1st, 2nd with 2nd …). The single pair
-- picked by hand (website_cars.before_photo_id / after_photo_id) goes away.

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
      select jsonb_agg(jsonb_build_object('id', a.id, 'favorite', a.is_cover, 'album', null) order by a.created_at, a.id)
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
            -- in the order they were added (the website puts the favorite first itself), with the before/after side
            'photos', coalesce((
              select jsonb_agg(jsonb_build_object(
                       'id', a.id,
                       'favorite', a.is_cover,
                       'album', case when lower(al.name) in ('before', 'prije') then 'before'
                                     when lower(al.name) in ('after', 'poslije') then 'after' end)
                     order by a.created_at, a.id)
              from public.attachments a
              left join public.photo_albums al on al.id = a.album_id
              where a.kind = 'photo' and a.on_website
                and a.entity_type = case when wc.car_id is not null then 'car' else 'job' end
                and a.entity_id = coalesce(wc.car_id, wc.job_id)
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

drop trigger website_cars_check on public.website_cars;
drop function app.check_website_car();
alter table public.website_cars
  drop column before_photo_id,
  drop column after_photo_id;
