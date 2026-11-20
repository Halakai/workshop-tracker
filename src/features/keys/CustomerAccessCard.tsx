// "Customer access" on a job (docs/PLAN.md §11 K2): keys that open the customer's own page.
import { useState } from 'react';
import { toast } from 'sonner';
import { ChevronRight, Copy, Eye, KeyRound, Loader2, Plus, Power, Share2 } from 'lucide-react';
import { FormDrawer } from '@/components/FormDrawer';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { formatDate } from '@/domain/dates';
import { syncErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { formatKeyCode, keyLink, keyPageHref } from '@/lib/customerKeys';
import { usePhotos } from '@/features/files/api';
import { useAccessKeys, useCreateKey, useSwitchKey, type AccessKey } from './api';

function openedText(key: AccessKey): string {
  if (key.switched_off_at) return `Switched off ${formatDate(key.switched_off_at)}`;
  if (!key.opened_count) return 'Not opened yet';
  return `Opened ${key.opened_count}× · last ${formatDate(key.last_opened_at)}`;
}

export function CustomerAccessCard({ jobId, jobRef }: { jobId: string; jobRef: string }) {
  const target = { jobId };
  const keys = useAccessKeys(target);
  const { photos } = usePhotos('job', jobId);
  const shownPhotos = photos.filter((p) => p.on_website).length;
  const [making, setMaking] = useState(false);
  const [open, setOpen] = useState<AccessKey | null>(null);
  const current = open ? (keys.data?.find((k) => k.id === open.id) ?? open) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" /> Customer access
        </CardTitle>
        <CardAction>
          <Button size="sm" variant="outline" onClick={() => setMaking(true)}>
            <Plus /> Make a key
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {keys.isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {keys.data?.length === 0 && (
          <p className="text-muted-foreground">
            With a key the customer sees this job on their phone: the work at your prices, their payments, the photos you tick and the invoice.
            Never your costs.
          </p>
        )}
        {keys.data && keys.data.length > 0 && (
          <ul className="-mx-2 divide-y">
            {keys.data.map((k) => (
              <li key={k.id}>
                <button type="button" onClick={() => setOpen(k)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left active:bg-muted">
                  <span className="min-w-0 flex-1">
                    <span className={cn('block font-mono font-medium tracking-wider', k.switched_off_at && 'text-muted-foreground line-through')}>
                      {formatKeyCode(k.code)}
                      {k.note && <span className="ml-2 font-sans font-normal tracking-normal text-muted-foreground no-underline">{k.note}</span>}
                    </span>
                    <span className="block text-xs text-muted-foreground">{openedText(k)}</span>
                  </span>
                  <ChevronRight className="size-5 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Eye className="mt-0.5 size-3.5 shrink-0" />
          {photos.length === 0
            ? 'Photos you add and tick “Customers can see” show on their page.'
            : `${shownPhotos} of ${photos.length} photo${photos.length === 1 ? '' : 's'} ticked “Customers can see” (open a photo to tick it).`}
        </p>
      </CardContent>

      <MakeKeyDrawer
        jobId={jobId}
        open={making}
        onOpenChange={setMaking}
        onMade={(k) => {
          setMaking(false);
          setOpen(k);
        }}
      />
      <KeyDrawer jobId={jobId} jobRef={jobRef} accessKey={current} onClose={() => setOpen(null)} />
    </Card>
  );
}

function MakeKeyDrawer({ jobId, open, onOpenChange, onMade }: { jobId: string; open: boolean; onOpenChange: (o: boolean) => void; onMade: (k: AccessKey) => void }) {
  const create = useCreateKey({ jobId });
  const [note, setNote] = useState('');
  const make = async () => {
    try {
      const key = await create.mutateAsync(note);
      setNote('');
      onMade(key);
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title="Make a customer key" description="A new code that opens this job’s page. You can switch it off any time.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void make();
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="key-note">Note (optional)</FieldLabel>
            <Input id="key-note" maxLength={80} placeholder="e.g. Ivan, or his wife" value={note} onChange={(e) => setNote(e.target.value)} />
            <FieldDescription>Only you see it: who you gave the key to.</FieldDescription>
          </Field>
          <Button type="submit" size="lg" disabled={create.isPending}>
            {create.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />} Make the key
          </Button>
        </FieldGroup>
      </form>
    </FormDrawer>
  );
}

function KeyDrawer({ jobId, jobRef, accessKey, onClose }: { jobId: string; jobRef: string; accessKey: AccessKey | null; onClose: () => void }) {
  return (
    <FormDrawer open={!!accessKey} onOpenChange={(o) => !o && onClose()} title={`Key for ${jobRef}`} description={accessKey?.note ?? undefined}>
      {accessKey && <KeyBody jobId={jobId} jobRef={jobRef} accessKey={accessKey} />}
    </FormDrawer>
  );
}

function KeyBody({ jobId, jobRef, accessKey }: { jobId: string; jobRef: string; accessKey: AccessKey }) {
  const switchKey = useSwitchKey({ jobId });
  const code = formatKeyCode(accessKey.code);
  const link = keyLink(accessKey.code);
  const off = Boolean(accessKey.switched_off_at);
  const message = `Pozdrav! Ovdje možete pratiti posao na svom autu: ${link}\nKod: ${code}`;

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error('Couldn’t copy here. Press and hold the text to copy it.');
    }
  };
  // phones only allow sharing right after a tap: everything is ready, nothing is fetched first
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Posao ${jobRef}`, text: message });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    await copy(message, 'Message with the link');
  };

  return (
    <div className="flex flex-col gap-4 pb-2">
      <div className={cn('rounded-xl border bg-muted/40 p-4 text-center', off && 'opacity-60')}>
        <p className={cn('font-mono text-3xl font-semibold tracking-widest select-all', off && 'line-through')}>{code}</p>
        <p className="mt-1 text-xs break-all text-muted-foreground select-all">{link}</p>
        <p className="mt-2 text-xs text-muted-foreground">{openedText(accessKey)}</p>
      </div>
      {!off && (
        <>
          <Button size="lg" onClick={share}>
            <Share2 /> Send to the customer
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => copy(link, 'Link')}>
              <Copy /> Copy link
            </Button>
            <Button variant="outline" onClick={() => copy(code, 'Code')}>
              <Copy /> Copy code
            </Button>
          </div>
          <Button variant="ghost" asChild>
            <a href={keyPageHref(accessKey.code)}>
              <Eye /> See what the customer sees
            </a>
          </Button>
        </>
      )}
      <div className="border-t pt-3">
        {off ? (
          <Button
            variant="outline"
            className="w-full"
            disabled={switchKey.isPending}
            onClick={async () => {
              try {
                await switchKey.mutateAsync({ key: accessKey, on: true });
                toast.success('The key works again');
              } catch (e) {
                toast.error(syncErrorMessage(e));
              }
            }}
          >
            <Power /> Switch on again
          </Button>
        ) : (
          <ConfirmButton
            variant="ghost"
            className="w-full text-destructive"
            title="Switch this key off?"
            description="It stops opening the page straight away. You can switch it on again later."
            confirmLabel="Switch off"
            onConfirm={async () => {
              try {
                await switchKey.mutateAsync({ key: accessKey, on: false });
                toast.success('Switched off');
              } catch (e) {
                toast.error(syncErrorMessage(e));
              }
            }}
          >
            <Power /> Switch off
          </ConfirmButton>
        )}
      </div>
    </div>
  );
}
