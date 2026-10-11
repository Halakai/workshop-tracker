-- The favorite photo (attachments.is_cover) is now set by the files function (POST /files/favorite), because
-- only the favorite keeps a small preview in Google Drive's .thumbs folder and that needs Drive.
drop function public.set_cover_photo(uuid, boolean);
