import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ImageUp, Loader2, Trash2 } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { AddedBy } from '@/components/AddedBy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { imageToPngDataUrl } from '@/lib/image';
import { syncErrorMessage } from '@/lib/errors';
import { useSettings, useUpdateSettings, type Settings } from './api';
import { useDriveHealth } from '@/features/files/api';
import { HardDrive } from 'lucide-react';

const schema = z.object({
  workshop_name: z.string().trim().min(1, 'Name is required').max(100),
  address: z.string().trim().max(300),
  phone: z.string().trim().max(40),
  email: z.string().trim().max(120),
  website: z.string().trim().max(200),
  iban: z.string().trim().max(40),
  invoice_title: z.string().trim().min(1).max(40),
  invoice_footer: z.string().trim().max(500),
});
type Values = z.infer<typeof schema>;

/** Workshop details shown on invoices (admins only). */
export function SettingsPage() {
  const settings = useSettings();
  return (
    <>
      <PageHeader title="Workshop settings" back="/more" />
      <PageBody>{settings.data ? <SettingsForm settings={settings.data} /> : <Skeleton className="h-96 rounded-xl" />}</PageBody>
    </>
  );
}

function SettingsForm({ settings }: { settings: Settings }) {
  const update = useUpdateSettings();
  const fileInput = useRef<HTMLInputElement>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      workshop_name: settings.workshop_name,
      address: settings.address ?? '',
      phone: settings.phone ?? '',
      email: settings.email ?? '',
      website: settings.website ?? '',
      iban: settings.iban ?? '',
      invoice_title: settings.invoice_title,
      invoice_footer: settings.invoice_footer ?? '',
    },
  });

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await update.mutateAsync({
        workshop_name: v.workshop_name,
        address: v.address || null,
        phone: v.phone || null,
        email: v.email || null,
        website: v.website || null,
        iban: v.iban.replace(/\s+/g, ' ').toUpperCase() || null,
        invoice_title: v.invoice_title,
        invoice_footer: v.invoice_footer || null,
      });
      toast.success('Settings saved');
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  });

  const onLogo = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await imageToPngDataUrl(file, 400);
      await update.mutateAsync({ logo_data_url: dataUrl });
      toast.success('Logo saved');
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };

  return (
    <>
      <DriveCard />

      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <div className="flex size-24 items-center justify-center overflow-hidden rounded-lg border bg-white">
            {settings.logo_data_url ? (
              <img src={settings.logo_data_url} alt="Workshop logo" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-xs text-muted-foreground">no logo</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
            <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={update.isPending}>
              <ImageUp /> Choose image
            </Button>
            {settings.logo_data_url && (
              <Button variant="ghost" className="text-destructive" onClick={() => update.mutate({ logo_data_url: null })}>
                <Trash2 /> Remove
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="s-name">Workshop name</FieldLabel>
            <Input id="s-name" {...form.register('workshop_name')} />
          </Field>
          <Field>
            <FieldLabel htmlFor="s-address">Address</FieldLabel>
            <Textarea id="s-address" rows={2} {...form.register('address')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="s-phone">Phone</FieldLabel>
              <Input id="s-phone" type="tel" {...form.register('phone')} />
            </Field>
            <Field>
              <FieldLabel htmlFor="s-email">Email</FieldLabel>
              <Input id="s-email" type="email" autoCapitalize="none" {...form.register('email')} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="s-web">Website</FieldLabel>
            <Input id="s-web" autoCapitalize="none" {...form.register('website')} />
          </Field>
          <Field>
            <FieldLabel htmlFor="s-iban">IBAN (optional)</FieldLabel>
            <Input id="s-iban" className="font-mono uppercase" {...form.register('iban')} />
            <FieldDescription>Printed on invoices so customers can pay by bank transfer.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="s-title">Document title</FieldLabel>
            <Input id="s-title" placeholder="Invoice" {...form.register('invoice_title')} />
            <FieldDescription>e.g. “Invoice” or “Job sheet”.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="s-footer">Footer note</FieldLabel>
            <Textarea id="s-footer" rows={2} placeholder="e.g. Not subject to VAT. Thank you!" {...form.register('invoice_footer')} />
          </Field>
          <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
            Save
          </Button>
          <AddedBy by={settings.updated_by} at={settings.updated_at} verb="last changed" />
        </FieldGroup>
      </form>
    </>
  );
}

function DriveCard() {
  const health = useDriveHealth();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Drive</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p className="text-muted-foreground">Photos, receipts and invoice copies go to the “Workshop Tracker” folder in your Google Drive.</p>
        <Button variant="outline" className="self-start" disabled={health.isPending} onClick={() => health.mutate()}>
          {health.isPending ? <Loader2 className="animate-spin" /> : <HardDrive />} Test Drive connection
        </Button>
        {health.data && <p className={health.data.ok ? 'text-success' : 'text-destructive'}>{health.data.message}</p>}
        {health.isError && <p className="text-destructive">{health.error.message}</p>}
      </CardContent>
    </Card>
  );
}
