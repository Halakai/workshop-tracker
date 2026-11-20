-- K1 · Login first: the website is only for the team now (docs/PLAN.md §11).
-- Nothing builds public pages any more; the app's view.html draws the website from live data. Members read the
-- same content the public build used to get (website_snapshot() stays service-role only).

create function public.website_preview() returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select app.is_member()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return public.website_snapshot();
end;
$$;

revoke all on function public.website_preview() from public, anon;
grant execute on function public.website_preview() to authenticated;
