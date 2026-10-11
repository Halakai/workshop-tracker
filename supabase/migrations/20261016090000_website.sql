-- W2 · Content of the public website (docs/PLAN.md §10): which cars and jobs are shown and how, which of their
-- photos, and the website's texts. Members read all of it; nobody without a login can. The website is built by
-- GitHub Actions from website_snapshot(), which only the files function (service role) can call, and which only
-- returns what is published: never plates, VINs, customers, costs or notes.

-- ---------------------------------------------------------------------------
-- Website texts (one row; admins edit). Name, address, phone and logo come from public.settings.
-- ---------------------------------------------------------------------------
create table public.website_settings (
  id boolean primary key default true check (id),
  headline_hr text check (char_length(headline_hr) <= 120),
  headline_en text check (char_length(headline_en) <= 120),
  intro_hr text check (char_length(intro_hr) <= 400),
  intro_en text check (char_length(intro_en) <= 400),
  about_hr text check (char_length(about_hr) <= 3000),
  about_en text check (char_length(about_en) <= 3000),
  hours_note_hr text check (char_length(hours_note_hr) <= 200),
  hours_note_en text check (char_length(hours_note_en) <= 200),
  -- "open in Google Maps"; without it the button searches for the workshop's address
  map_url text check (map_url ~ '^https://' and char_length(map_url) <= 500),
  instagram_url text check (instagram_url ~ '^https://' and char_length(instagram_url) <= 300),
  facebook_url text check (facebook_url ~ '^https://' and char_length(facebook_url) <= 300),
  -- photos for "about us" (the favorite one is the big photo at the top) are attachments of this id
  photos_id uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

create trigger website_settings_audit before insert or update on public.website_settings
  for each row execute function app.stamp_audit();

insert into public.website_settings (headline_hr, headline_en, intro_hr, intro_en, hours_note_hr, hours_note_en) values (
  'Popravak, restauracija i prodaja automobila',
  'Car repair, restoration and sales',
  'Mala radionica koja se posveti svakom autu. Pogledajte što smo napravili i javite nam se.',
  'A small workshop that takes care of every car. See what we have done and get in touch.',
  'Izvan radnog vremena po dogovoru.',
  'Outside these hours by appointment.'
);

-- ---------------------------------------------------------------------------
-- Contact buttons: a name and number, and which buttons it gets (call / WhatsApp / Viber)
-- ---------------------------------------------------------------------------
create table public.website_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  -- with the country code, so WhatsApp and Viber links work: +385 91 234 5678
  phone text not null check (phone ~ '^\+[0-9][0-9 ]{6,24}$'),
  call boolean not null default true,
  whatsapp boolean not null default false,
  viber boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint website_contacts_some_button check (call or whatsapp or viber)
);

create trigger website_contacts_audit before insert or update on public.website_contacts
  for each row execute function app.stamp_audit();

-- ---------------------------------------------------------------------------
-- Services and reviews (English falls back to Croatian on the website)
-- ---------------------------------------------------------------------------
create table public.website_services (
  id uuid primary key default gen_random_uuid(),
  title_hr text not null check (char_length(title_hr) between 1 and 80 and title_hr = btrim(title_hr)),
  title_en text check (char_length(title_en) <= 80),
  text_hr text check (char_length(text_hr) <= 600),
  text_en text check (char_length(text_en) <= 600),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

create trigger website_services_audit before insert or update on public.website_services
  for each row execute function app.stamp_audit();

create table public.website_reviews (
  id uuid primary key default gen_random_uuid(),
  -- as shown, e.g. "Marko, Golf IV"
  author text not null check (char_length(author) between 1 and 60 and author = btrim(author)),
  stars integer check (stars between 1 and 5),
  text_hr text not null check (char_length(btrim(text_hr)) between 1 and 800),
  text_en text check (char_length(text_en) <= 800),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

create trigger website_reviews_audit before insert or update on public.website_reviews
  for each row execute function app.stamp_audit();

-- ---------------------------------------------------------------------------
-- Opening hours, Monday (1) to Sunday (7); no times = closed
-- ---------------------------------------------------------------------------
create table public.website_hours (
  weekday integer primary key check (weekday between 1 and 7),
  opens time,
  closes time,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint website_hours_both check ((opens is null) = (closes is null)),
  constraint website_hours_order check (opens is null or opens < closes)
);

create function app.stamp_website_hours() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;
revoke all on function app.stamp_website_hours() from public;

create trigger website_hours_audit before update on public.website_hours
  for each row execute function app.stamp_website_hours();

insert into public.website_hours (weekday, opens, closes) values
  (1, '08:00', '16:00'),
  (2, '08:00', '16:00'),
  (3, '08:00', '16:00'),
  (4, '08:00', '16:00'),
  (5, '08:00', '16:00'),
  (6, null, null),
  (7, null, null);

-- ---------------------------------------------------------------------------
-- Cars and jobs on the website (members edit)
-- ---------------------------------------------------------------------------
create table public.website_cars (
  id uuid primary key default gen_random_uuid(),
  car_id uuid unique references public.cars (id) on delete cascade,
  job_id uuid unique references public.jobs (id) on delete cascade,
  -- the page's address: …/auti/<slug>/ and …/en/cars/<slug>/
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title_hr text not null check (char_length(title_hr) between 1 and 100 and title_hr = btrim(title_hr)),
  title_en text check (char_length(title_en) <= 100),
  -- one line under the title on the cards ("Engine rebuild and new paint")
  summary_hr text check (char_length(summary_hr) <= 160),
  summary_en text check (char_length(summary_en) <= 160),
  -- "what we did"
  story_hr text check (char_length(story_hr) <= 4000),
  story_en text check (char_length(story_en) <= 4000),
  show_year boolean not null default true,
  show_engine boolean not null default true,
  show_fuel boolean not null default true,
  show_mileage boolean not null default true,
  customer_agreed boolean not null default false,
  is_public boolean not null default false,
  -- shown before the others
  pinned boolean not null default false,
  -- the before/after slider
  before_photo_id uuid references public.attachments (id) on delete set null,
  after_photo_id uuid references public.attachments (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint website_cars_one_record check (num_nonnulls(car_id, job_id) = 1),
  -- a customer's car is only shown once the customer agreed
  constraint website_cars_customer_agreed check (car_id is not null or customer_agreed or not is_public)
);

create trigger website_cars_audit before insert or update on public.website_cars
  for each row execute function app.stamp_audit();

-- the before/after photos must be photos of this car or job
create function app.check_website_car() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_type text := case when new.car_id is not null then 'car' else 'job' end;
  v_id uuid := coalesce(new.car_id, new.job_id);
begin
  if exists (
    select 1
    from unnest(array[new.before_photo_id, new.after_photo_id]) p(id)
    where p.id is not null
      and not exists (
        select 1 from public.attachments a
        where a.id = p.id and a.kind = 'photo' and a.entity_type = v_type and a.entity_id = v_id
      )
  ) then
    raise exception 'The before and after photos must be photos of this %', v_type;
  end if;
  return new;
end;
$$;
revoke all on function app.check_website_car() from public;

create trigger website_cars_check before insert or update of before_photo_id, after_photo_id on public.website_cars
  for each row execute function app.check_website_car();

create function app.log_website_car_activity() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.website_cars%rowtype := case when tg_op = 'DELETE' then old else new end;
  v_now boolean := tg_op <> 'DELETE' and new.is_public;
  v_was boolean := tg_op <> 'INSERT' and old.is_public;
  v_type text := case when v_row.car_id is not null then 'car' else 'job' end;
  v_ref text;
begin
  if v_now is distinct from v_was then
    if v_type = 'car' then
      select ref into v_ref from public.cars where id = v_row.car_id;
    else
      select ref into v_ref from public.jobs where id = v_row.job_id;
    end if;
    -- (nothing to log when the car or job itself is being deleted)
    if v_ref is not null then
      perform app.log_activity(v_type, coalesce(v_row.car_id, v_row.job_id), 'website',
        format(case when v_now then 'Put %s on the website' else 'Took %s off the website' end, v_ref));
    end if;
  end if;
  return v_row;
end;
$$;
revoke all on function app.log_website_car_activity() from public;

create trigger website_cars_activity after insert or update of is_public or delete on public.website_cars
  for each row execute function app.log_website_car_activity();

-- ---------------------------------------------------------------------------
-- Photos: which car and job photos are on the website; "about us" photos
-- ---------------------------------------------------------------------------
alter table public.attachments
  add column on_website boolean not null default false,
  drop constraint attachments_photo_extras,
  add constraint attachments_photo_extras check (kind = 'photo' or (album_id is null and not is_cover and not on_website)),
  drop constraint attachments_entity_type_check,
  add constraint attachments_entity_type_check
    check (entity_type in ('car', 'job', 'stock_movement', 'transaction', 'tool', 'item', 'website'));

create function public.set_photo_on_website(p_attachment_id uuid, p_on boolean) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo public.attachments%rowtype;
begin
  if not (select app.is_member()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_photo from public.attachments where id = p_attachment_id for update;
  if not found then
    raise exception 'Photo not found';
  end if;
  if v_photo.kind <> 'photo' or v_photo.entity_type not in ('car', 'job') then
    raise exception 'Only photos of cars and jobs can be chosen for the website';
  end if;
  update public.attachments set on_website = p_on where id = v_photo.id and on_website <> p_on;
end;
$$;

-- ---------------------------------------------------------------------------
-- What the website is built from. Only the service role (the files function, with the build token) calls these.
-- ---------------------------------------------------------------------------
create function app.website_car_is_public(p_car public.website_cars) returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_car.is_public and (p_car.car_id is not null or p_car.customer_agreed);
$$;
revoke all on function app.website_car_is_public(public.website_cars) from public;

create function public.website_snapshot() returns jsonb
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
      select jsonb_agg(jsonb_build_object('id', a.id, 'favorite', a.is_cover) order by a.is_cover desc, a.created_at, a.id)
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
            'photos', coalesce((
              select jsonb_agg(jsonb_build_object('id', a.id, 'favorite', a.is_cover) order by a.is_cover desc, a.created_at, a.id)
              from public.attachments a
              where a.kind = 'photo' and a.on_website
                and a.entity_type = case when wc.car_id is not null then 'car' else 'job' end
                and a.entity_id = coalesce(wc.car_id, wc.job_id)
            ), '[]'::jsonb),
            -- the slider only when both of its photos are on the website
            'before_photo_id', case when bp.on_website and ap.on_website then wc.before_photo_id end,
            'after_photo_id', case when bp.on_website and ap.on_website then wc.after_photo_id end
          ) as car
        from public.website_cars wc
        left join public.cars c on c.id = wc.car_id
        left join public.jobs j on j.id = wc.job_id
        left join public.attachments bp on bp.id = wc.before_photo_id
        left join public.attachments ap on ap.id = wc.after_photo_id
        where app.website_car_is_public(wc)
      ) x
    ), '[]'::jsonb)
  );
$$;

-- the Drive file of a photo that is on the website (nothing for any other file)
create function public.website_photo(p_attachment_id uuid) returns table (drive_file_id text, mime_type text)
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
    );
$$;

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
alter table public.website_settings enable row level security;
alter table public.website_contacts enable row level security;
alter table public.website_services enable row level security;
alter table public.website_reviews enable row level security;
alter table public.website_hours enable row level security;
alter table public.website_cars enable row level security;

revoke all on public.website_settings, public.website_contacts, public.website_services, public.website_reviews,
  public.website_hours, public.website_cars from anon, authenticated;
grant all on public.website_settings, public.website_contacts, public.website_services, public.website_reviews,
  public.website_hours, public.website_cars to service_role;

-- texts: members read, admins write
grant select on public.website_settings, public.website_hours to authenticated;
grant update (headline_hr, headline_en, intro_hr, intro_en, about_hr, about_en, hours_note_hr, hours_note_en,
              map_url, instagram_url, facebook_url)
  on public.website_settings to authenticated;
grant update (opens, closes) on public.website_hours to authenticated;
grant select, insert, update, delete on public.website_contacts, public.website_services, public.website_reviews
  to authenticated;

create policy "members read website settings" on public.website_settings
  for select to authenticated using ((select app.is_member()));
create policy "admins edit website settings" on public.website_settings
  for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy "members read website hours" on public.website_hours
  for select to authenticated using ((select app.is_member()));
create policy "admins edit website hours" on public.website_hours
  for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));

create policy "members read website contacts" on public.website_contacts
  for select to authenticated using ((select app.is_member()));
create policy "admins add website contacts" on public.website_contacts
  for insert to authenticated with check ((select app.is_admin()));
create policy "admins edit website contacts" on public.website_contacts
  for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy "admins delete website contacts" on public.website_contacts
  for delete to authenticated using ((select app.is_admin()));

create policy "members read website services" on public.website_services
  for select to authenticated using ((select app.is_member()));
create policy "admins add website services" on public.website_services
  for insert to authenticated with check ((select app.is_admin()));
create policy "admins edit website services" on public.website_services
  for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy "admins delete website services" on public.website_services
  for delete to authenticated using ((select app.is_admin()));

create policy "members read website reviews" on public.website_reviews
  for select to authenticated using ((select app.is_member()));
create policy "admins add website reviews" on public.website_reviews
  for insert to authenticated with check ((select app.is_admin()));
create policy "admins edit website reviews" on public.website_reviews
  for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy "admins delete website reviews" on public.website_reviews
  for delete to authenticated using ((select app.is_admin()));

-- cars and jobs on the website: members do everything (but can't move a listing to another car or job)
grant select, delete on public.website_cars to authenticated;
grant insert (id, car_id, job_id, slug, title_hr, title_en, summary_hr, summary_en, story_hr, story_en, show_year,
              show_engine, show_fuel, show_mileage, customer_agreed, is_public, pinned, before_photo_id, after_photo_id)
  on public.website_cars to authenticated;
grant update (slug, title_hr, title_en, summary_hr, summary_en, story_hr, story_en, show_year, show_engine, show_fuel,
              show_mileage, customer_agreed, is_public, pinned, before_photo_id, after_photo_id)
  on public.website_cars to authenticated;

create policy "members read website cars" on public.website_cars
  for select to authenticated using ((select app.is_member()));
create policy "members add website cars" on public.website_cars
  for insert to authenticated with check ((select app.is_member()));
create policy "members edit website cars" on public.website_cars
  for update to authenticated using ((select app.is_member())) with check ((select app.is_member()));
create policy "members delete website cars" on public.website_cars
  for delete to authenticated using ((select app.is_member()));

revoke all on function public.set_photo_on_website(uuid, boolean) from public, anon;
grant execute on function public.set_photo_on_website(uuid, boolean) to authenticated;
revoke all on function public.website_snapshot() from public, anon, authenticated;
revoke all on function public.website_photo(uuid) from public, anon, authenticated;
grant execute on function public.website_snapshot() to service_role;
grant execute on function public.website_photo(uuid) to service_role;
