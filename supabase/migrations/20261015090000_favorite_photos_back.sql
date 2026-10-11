-- Back to how favorites (attachments.is_cover) worked on 10.10.2026: every photo keeps its small preview again,
-- so choosing the favorite needs no Google Drive and is a plain database change. Same function as in
-- 20261013090000_photos.sql (20261014090000 had dropped it).
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
    raise exception 'Only a photo can be the favorite';
  end if;
  if p_cover then
    update public.attachments
    set is_cover = false
    where entity_type = v_photo.entity_type and entity_id = v_photo.entity_id and is_cover and id <> v_photo.id;
  end if;
  update public.attachments set is_cover = p_cover where id = v_photo.id and is_cover <> p_cover;
end;
$$;

revoke all on function public.set_cover_photo(uuid, boolean) from public, anon;
grant execute on function public.set_cover_photo(uuid, boolean) to authenticated;
