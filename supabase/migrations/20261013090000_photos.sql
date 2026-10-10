-- Photos: albums (Before, After …), one cover photo per record (shown first and in the lists), and photos of
-- inventory items. Attachments are written by the files function; the cover and the album are changed here.

-- ---------------------------------------------------------------------------
-- Photo albums: a shared list like the cost types (members add, admins rename and delete)
-- ---------------------------------------------------------------------------
create table public.photo_albums (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
create unique index photo_albums_name_key on public.photo_albums (lower(name));

create trigger photo_albums_audit before insert or update on public.photo_albums
  for each row execute function app.stamp_audit();

insert into public.photo_albums (name, sort_order) values
  ('Before', 10),
  ('After', 20);

alter table public.photo_albums enable row level security;
revoke all on public.photo_albums from anon, authenticated;
grant all on public.photo_albums to service_role;
grant select, insert, update, delete on public.photo_albums to authenticated;

create policy "members read photo albums" on public.photo_albums
  for select to authenticated using ((select app.is_member()));
create policy "members add photo albums" on public.photo_albums
  for insert to authenticated with check ((select app.is_member()));
create policy "admins edit photo albums" on public.photo_albums
  for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy "admins delete photo albums" on public.photo_albums
  for delete to authenticated using ((select app.is_admin()));

-- ---------------------------------------------------------------------------
-- Attachments: album, cover, and photos of inventory items
-- ---------------------------------------------------------------------------
alter table public.attachments
  add column album_id uuid references public.photo_albums (id),
  add column is_cover boolean not null default false,
  -- only photos go into albums or become the cover
  add constraint attachments_photo_extras check (kind = 'photo' or (album_id is null and not is_cover));

create index attachments_album_idx on public.attachments (album_id);
-- at most one cover per car, job, tool or item
create unique index attachments_one_cover on public.attachments (entity_type, entity_id) where is_cover;

alter table public.attachments
  drop constraint attachments_entity_type_check,
  add constraint attachments_entity_type_check
    check (entity_type in ('car', 'job', 'stock_movement', 'transaction', 'tool', 'item'));

-- ---------------------------------------------------------------------------
-- set_cover_photo: makes a photo the record's cover (the previous cover stops being one), or takes it back
-- ---------------------------------------------------------------------------
create function public.set_cover_photo(p_attachment_id uuid, p_cover boolean default true) returns void
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
  if v_photo.kind <> 'photo' then
    raise exception 'Only a photo can be the cover';
  end if;
  if p_cover then
    update public.attachments
    set is_cover = false
    where entity_type = v_photo.entity_type and entity_id = v_photo.entity_id and is_cover and id <> v_photo.id;
  end if;
  update public.attachments set is_cover = p_cover where id = v_photo.id and is_cover <> p_cover;
end;
$$;

-- ---------------------------------------------------------------------------
-- move_photo_to_album: puts a photo into an album (null: no album)
-- ---------------------------------------------------------------------------
create function public.move_photo_to_album(p_attachment_id uuid, p_album_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
begin
  if not (select app.is_member()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select kind into v_kind from public.attachments where id = p_attachment_id for update;
  if not found then
    raise exception 'Photo not found';
  end if;
  if v_kind <> 'photo' then
    raise exception 'Only photos go into albums';
  end if;
  update public.attachments set album_id = p_album_id where id = p_attachment_id;
end;
$$;

revoke all on function public.set_cover_photo(uuid, boolean) from public, anon;
revoke all on function public.move_photo_to_album(uuid, uuid) from public, anon;
grant execute on function public.set_cover_photo(uuid, boolean) to authenticated;
grant execute on function public.move_photo_to_album(uuid, uuid) to authenticated;
