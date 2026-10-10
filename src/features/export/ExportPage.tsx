import { useState } from 'react';
import { toast } from 'sonner';
import { Archive, FileJson, Loader2 } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { syncErrorMessage } from '@/lib/errors';
import { toCsv } from '@/domain/csv';
import { formatDateTime, todayIso } from '@/domain/dates';
import { useSettings, useUpdateSettings } from '@/features/settings/api';

/** Everything in the database, in dependency-friendly order. */
const TABLES = [
  'profiles',
  'accounts',
  'settings',
  'item_categories',
  'units',
  'brands',
  'expense_categories',
  'contacts',
  'items',
  'cars',
  'car_shares',
  'jobs',
  'job_shares',
  'transactions',
  'stock_movements',
  'job_lines',
  'settlements',
  'allocations',
  'attachments',
  'activity_log',
] as const;

async function fetchAll(table: (typeof TABLES)[number]) {
  const rows: Record<string, unknown>[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from(table as 'items')
      .select('*')
      .range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as Record<string, unknown>[]));
    if (data.length < page) return rows;
  }
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

/** Backup: every table as one JSON file, or as CSV files in a ZIP (admins only). */
export function ExportPage() {
  const settings = useSettings();
  const update = useUpdateSettings();
  const [busy, setBusy] = useState<'json' | 'csv' | null>(null);

  const run = async (format: 'json' | 'csv') => {
    setBusy(format);
    try {
      const data: Record<string, Record<string, unknown>[]> = {};
      for (const table of TABLES) data[table] = await fetchAll(table);
      const stamp = todayIso();
      if (format === 'json') {
        const json = JSON.stringify({ exported_at: new Date().toISOString(), app: 'workshop-tracker', tables: data }, null, 1);
        download(new Blob([json], { type: 'application/json' }), `workshop-backup-${stamp}.json`);
      } else {
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        for (const table of TABLES) zip.file(`${table}.csv`, toCsv(data[table]));
        download(await zip.generateAsync({ type: 'blob' }), `workshop-backup-${stamp}.zip`);
      }
      await update.mutateAsync({ last_export_at: new Date().toISOString() });
      const total = Object.values(data).reduce((s, rows) => s + rows.length, 0);
      toast.success(`Exported ${total} rows from ${TABLES.length} tables`);
    } catch (e) {
      toast.error(syncErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Backup & export" back="/more" />
      <PageBody>
        <p className="text-sm text-muted-foreground">
          The free Supabase plan has no backups you can download, so save a copy here now and then (e.g. monthly) and keep
          it somewhere safe. Photos and receipts are already in Google Drive.
        </p>
        <Card>
          <CardContent className="flex flex-col gap-3">
            <Button size="lg" disabled={busy !== null} onClick={() => run('json')}>
              {busy === 'json' ? <Loader2 className="animate-spin" /> : <FileJson />} Everything as JSON
            </Button>
            <Button size="lg" variant="outline" disabled={busy !== null} onClick={() => run('csv')}>
              {busy === 'csv' ? <Loader2 className="animate-spin" /> : <Archive />} CSV files (ZIP) for Excel
            </Button>
            <p className="text-xs text-muted-foreground">
              Last export: {settings.data?.last_export_at ? formatDateTime(settings.data.last_export_at) : 'never'}
            </p>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
