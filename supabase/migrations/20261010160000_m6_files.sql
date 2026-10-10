-- M6 · photos and receipts in Google Drive.
-- The files live in the admin's Google Drive (folder "Workshop Tracker"); the database only knows
-- which Drive file belongs to which record. All writes go through the "files" Edge Function.

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('car', 'job', 'stock_movement', 'transaction')),
  entity_id uuid not null,
  kind text not null check (kind in ('photo', 'receipt', 'invoice', 'document')),
  drive_file_id text not null unique,
  drive_thumb_id text,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
create index attachments_entity_idx on public.attachments (entity_type, entity_id);

create trigger attachments_audit before insert or update on public.attachments
  for each row execute function app.stamp_audit();

-- Drive folder ids the function has created, by a stable key ("car:<id>/Photos", "receipts/2026" …)
create table public.drive_folders (
  key text primary key,
  drive_folder_id text not null,
  created_at timestamptz not null default now()
);

alter table public.attachments enable row level security;
alter table public.drive_folders enable row level security;

revoke all on public.attachments, public.drive_folders from anon, authenticated;
grant all on public.attachments, public.drive_folders to service_role;
grant select on public.attachments to authenticated;

create policy "members read attachments" on public.attachments
  for select to authenticated using ((select app.is_member()));
-- no write policies: uploads and deletes go through the files function (it checks membership)
