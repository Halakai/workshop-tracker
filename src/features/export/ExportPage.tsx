import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, FileJson, FileUp, Loader2, RotateCcw, X } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import type { Json } from '@/lib/database.types';
import { syncErrorMessage } from '@/lib/errors';
import { toCsv } from '@/domain/csv';
import { formatDateTime, todayIso } from '@/domain/dates';
import {
  applyPeopleMap,
  backupCounts,
  backupPeople,
  BackupError,
  mappingProblem,
  matchPeople,
  parseBackup,
  type Backup,
  type BackupRow,
} from '@/domain/backup';
import { useProfiles } from '@/features/auth/profiles';
import { useSettings, useUpdateSettings } from '@/features/settings/api';

async function fetchAll(table: string) {
  const rows: BackupRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from(table as 'items')
      .select('*')
      .range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as BackupRow[]));
    if (data.length < page) return rows;
  }
}

/** Everything in the database: the users first, then every table parents before children (the database decides which). */
async function makeBackup(): Promise<Backup> {
  const { data: tables, error } = await supabase.rpc('backup_tables');
  if (error) throw error;
  const result: Record<string, BackupRow[]> = {};
  for (const table of ['profiles', ...tables]) result[table] = await fetchAll(table);
  return { app: 'workshop-tracker', version: 2, exported_at: new Date().toISOString(), tables: result };
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const downloadJson = (backup: Backup, name: string) =>
  download(new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' }), name);

/** Backup: every table as one JSON file (which can be restored), or as CSV files in a ZIP. Admins only. */
export function ExportPage() {
  const settings = useSettings();
  const update = useUpdateSettings();
  const [busy, setBusy] = useState<'json' | 'csv' | null>(null);

  const run = async (format: 'json' | 'csv') => {
    setBusy(format);
    try {
      const backup = await makeBackup();
      const stamp = todayIso();
      if (format === 'json') {
        downloadJson(backup, `workshop-backup-${stamp}.json`);
      } else {
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        for (const [table, rows] of Object.entries(backup.tables)) zip.file(`${table}.csv`, toCsv(rows));
        download(await zip.generateAsync({ type: 'blob' }), `workshop-backup-${stamp}.zip`);
      }
      await update.mutateAsync({ last_export_at: new Date().toISOString() });
      const tables = Object.values(backup.tables);
      toast.success(`Exported ${tables.reduce((s, rows) => s + rows.length, 0)} rows from ${tables.length} tables`);
    } catch (e) {
      toast.error(syncErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Backup & restore" back="/more" />
      <PageBody>
        <Card>
          <CardHeader>
            <CardTitle>Make a backup</CardTitle>
            <CardDescription>
              The free Supabase plan has no backups you can download, so save a copy here now and then (e.g. monthly) and
              keep it somewhere safe, like Google Drive. Photos and receipts are already in Google Drive.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button size="lg" disabled={busy !== null} onClick={() => run('json')}>
              {busy === 'json' ? <Loader2 className="animate-spin" /> : <FileJson />} Backup file (JSON)
            </Button>
            <Button size="lg" variant="outline" disabled={busy !== null} onClick={() => run('csv')}>
              {busy === 'csv' ? <Loader2 className="animate-spin" /> : <Archive />} CSV files (ZIP) for Excel
            </Button>
            <p className="text-xs text-muted-foreground">
              Only the JSON file can be restored. Last backup:{' '}
              {settings.data?.last_export_at ? formatDateTime(settings.data.last_export_at) : 'never'}
            </p>
          </CardContent>
        </Card>

        <RestoreCard />
      </PageBody>
    </>
  );
}

function RestoreCard() {
  const queryClient = useQueryClient();
  const profiles = useProfiles();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; backup: Backup } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [map, setMap] = useState<Map<string, string | null>>(new Map());

  const users = useMemo(() => (profiles.data ?? []).map((p) => ({ id: p.id, name: p.display_name, email: p.email })), [profiles.data]);
  const people = useMemo(() => (file ? backupPeople(file.backup) : []), [file]);
  const problem = file ? mappingProblem(map, people) : null;

  const choose = async (f: File | undefined) => {
    setFileError(null);
    setFile(null);
    if (!f) return;
    try {
      const backup = parseBackup(await f.text());
      setFile({ name: f.name, backup });
      setMap(matchPeople(backupPeople(backup), users));
    } catch (e) {
      setFileError(e instanceof BackupError ? e.message : syncErrorMessage(e));
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const restore = async () => {
    if (!file || problem) return;
    try {
      // a copy of what is in the app now, in case this was the wrong file
      downloadJson(await makeBackup(), `workshop-before-restore-${todayIso()}.json`);
      const { data, error } = await supabase.rpc('admin_restore', { p_backup: applyPeopleMap(file.backup, map) as unknown as Json });
      if (error) throw error;
      const rows = Object.values((data ?? {}) as Record<string, number>).reduce((s, n) => s + n, 0);
      await queryClient.invalidateQueries();
      setFile(null);
      toast.success(`Restored ${rows} rows. The data from before was saved to this device.`);
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };

  const counts = file ? backupCounts(file.backup) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Restore a backup</CardTitle>
        <CardDescription>
          Replaces everything in the app (inventory, cars, jobs, money, contacts, lists, settings and history) with what
          is in a backup file. Users, passwords and profit shares stay as they are.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
        {!file && (
          <Button size="lg" variant="outline" onClick={() => fileInput.current?.click()}>
            <FileUp /> Choose backup file
          </Button>
        )}
        {fileError && <p className="text-sm text-destructive">{fileError}</p>}

        {file && counts && (
          <>
            <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{file.name}</p>
                <p className="text-muted-foreground">
                  Made {file.backup.exported_at ? formatDateTime(file.backup.exported_at) : 'at an unknown time'} · {counts.cars} cars ·{' '}
                  {counts.jobs} jobs · {counts.items} items · {counts.money} money entries · {counts.contacts} contacts
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Choose another file" onClick={() => setFile(null)}>
                <X />
              </Button>
            </div>

            {people.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-sm">Who is who now? (Matched by account, email or name: check it.)</p>
                {people.map((p) => (
                  <Field key={p.id} orientation="horizontal" className="items-center">
                    <FieldLabel className="min-w-0 flex-1">
                      <span className="truncate">
                        {p.name}
                        {p.email && <span className="block truncate text-xs font-normal text-muted-foreground">{p.email}</span>}
                      </span>
                    </FieldLabel>
                    <Select value={map.get(p.id) ?? ''} onValueChange={(v) => setMap(new Map(map).set(p.id, v))}>
                      <SelectTrigger className="w-44">
                        <SelectValue placeholder="Choose user" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ))}
                <p className="text-xs text-muted-foreground">
                  Someone missing? Add them under More → Users & partners first.
                </p>
              </div>
            )}

            <FieldError>{problem}</FieldError>
            <ConfirmButton
              size="lg"
              variant="destructive"
              disabled={Boolean(problem)}
              title="Replace all data with this backup?"
              description="Everything entered since this backup was made will be gone. The app first saves a copy of the current data to this device, so you can go back."
              confirmLabel="Restore"
              onConfirm={restore}
            >
              <RotateCcw /> Restore this backup
            </ConfirmButton>
          </>
        )}
      </CardContent>
    </Card>
  );
}
