// Keys on a job, a car or the website (docs/PLAN.md §11): the card with its keys, making one, and one key's pop-up
// (send, copy, see what they see, change, switch off). More → Keys lists them all.
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { ChevronRight, Copy, Eye, KeyRound, Pencil, Plus, Power, Share2 } from 'lucide-react';
import { FormDrawer } from '@/components/FormDrawer';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/domain/dates';
import { KEY_KIND_LABEL, keyState, lastDay, readShows, shareMessage, WEBSITE_SECTIONS, type KeyKind } from '@/domain/keys';
import { syncErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { formatKeyCode, keyLink, keyPageHref } from '@/lib/customerKeys';
import { usePhotos } from '@/features/files/api';
import { useAccessKeys, useUpdateKey, type AccessKey, type KeyTarget } from './api';
import { KeyForm, targetOf } from './KeyForm';

/** "Works until 24.12.2026 · opened 3× (last 20.11.2026)" */
export function keyStatusText(key: AccessKey): string {
  const state = keyState(key);
  if (state === 'off') return `Switched off ${formatDate(key.switched_off_at)}`;
  if (state === 'expired') return `Expired after ${formatDate(lastDay(key.expires_at!))}`;
  const until = key.expires_at ? `Works until ${formatDate(lastDay(key.expires_at))}` : 'Works until switched off';
  const opened = key.opened_count ? `opened ${key.opened_count}× (last ${formatDate(key.last_opened_at)})` : 'not opened yet';
  return `${until} · ${opened}`;
}

/** What a website key shows, in a few words. */
function showsText(key: AccessKey): string | null {
  if (key.kind !== 'website') return null;
  const s = readShows(key.shows);
  const parts = s.sections.length === WEBSITE_SECTIONS.length ? ['Everything'] : WEBSITE_SECTIONS.filter((x) => s.sections.includes(x.value)).map((x) => x.label);
  if (s.cars === 'chosen') parts.push(`${s.car_ids.length} chosen car${s.car_ids.length === 1 ? '' : 's'}`);
  if (!s.prices) parts.push('no prices');
  return parts.join(', ');
}

export function KeyRow({ accessKey, label, onOpen }: { accessKey: AccessKey; label?: string; onOpen: () => void }) {
  const state = keyState(accessKey);
  const who = accessKey.note ?? (accessKey.kind === 'website' ? 'Public' : null);
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left active:bg-muted">
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className={cn('font-mono font-medium tracking-wider', state !== 'working' && 'text-muted-foreground line-through')}>{formatKeyCode(accessKey.code)}</span>
          {who && <span className="text-sm">{who}</span>}
          {(accessKey.kind === 'buyer' || accessKey.kind === 'owner') && (
            <Badge variant="outline" className="text-xs">
              {KEY_KIND_LABEL[accessKey.kind]}
            </Badge>
          )}
        </span>
        {label && <span className="block truncate text-xs">{label}</span>}
        {showsText(accessKey) && <span className="block truncate text-xs text-muted-foreground">Shows: {showsText(accessKey)}</span>}
        <span className="block text-xs text-muted-foreground">{keyStatusText(accessKey)}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </button>
  );
}

const CARD_TEXT = {
  job: {
    title: 'Customer access',
    empty: 'With a key the customer sees this job on their phone: the work at your prices, their payments, the photos you tick and the invoice. Never your costs.',
  },
  car: {
    title: 'Customer access',
    empty: 'A key for a buyer shows the car with its asking price; one for the owner shows what you did and the parts fitted. Never what it cost you.',
  },
  website: {
    title: 'Visitor keys',
    empty: 'A key opens the website for people outside the team: a public one for ads, or one per person. You choose what each one shows.',
  },
};

/** The keys of a job, a car or the website, with "Make a key". */
export function KeysCard({ target, subject, defaultNote }: { target: KeyTarget; subject: string; defaultNote?: string }) {
  const keys = useAccessKeys(target);
  const which = 'jobId' in target ? 'job' : 'carId' in target ? 'car' : 'website';
  const text = CARD_TEXT[which];
  const photoTarget = 'jobId' in target ? (['job', target.jobId] as const) : 'carId' in target ? (['car', target.carId] as const) : null;
  const [making, setMaking] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const current = keys.data?.find((k) => k.id === open) ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" /> {text.title}
        </CardTitle>
        <CardAction>
          <Button size="sm" variant="outline" onClick={() => setMaking(true)}>
            <Plus /> Make a key
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {keys.isPending && <Skeleton className="h-12 rounded-lg" />}
        {keys.data?.length === 0 && <p className="text-muted-foreground">{text.empty}</p>}
        {keys.data && keys.data.length > 0 && (
          <ul className="-mx-2 divide-y">
            {keys.data.map((k) => (
              <li key={k.id}>
                <KeyRow accessKey={k} onOpen={() => setOpen(k.id)} />
              </li>
            ))}
          </ul>
        )}
        {photoTarget && <PhotoHint entityType={photoTarget[0]} entityId={photoTarget[1]} />}
      </CardContent>

      <FormDrawer open={making} onOpenChange={setMaking} title={which === 'website' ? 'Make a website key' : `Make a key for ${subject}`}>
        {making && (
          <KeyForm
            target={target}
            defaultNote={defaultNote}
            onSaved={(k) => {
              setMaking(false);
              setOpen(k.id);
            }}
          />
        )}
      </FormDrawer>
      <KeyDrawer accessKey={current} subject={subject} onClose={() => setOpen(null)} />
    </Card>
  );
}

function PhotoHint({ entityType, entityId }: { entityType: 'job' | 'car'; entityId: string }) {
  const { photos } = usePhotos(entityType, entityId);
  const shown = photos.filter((p) => p.on_website).length;
  return (
    <p className="flex items-start gap-2 text-xs text-muted-foreground">
      <Eye className="mt-0.5 size-3.5 shrink-0" />
      {photos.length === 0
        ? 'Photos you add and tick “Show to customers” are on their page.'
        : `${shown} of ${photos.length} photo${photos.length === 1 ? '' : 's'} ticked for customers (open a photo to tick it).`}
    </p>
  );
}

/** One key: send it, copy it, see what they see, change it, switch it off. `subject`: "J-012", "CAR-003", "Website". */
export function KeyDrawer({
  accessKey,
  subject,
  openHref,
  onClose,
}: {
  accessKey: AccessKey | null;
  subject: string;
  /** More → Keys: a way to the job or car */
  openHref?: string;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const close = () => {
    setEditing(false);
    onClose();
  };
  return (
    <FormDrawer
      open={!!accessKey}
      onOpenChange={(o) => !o && close()}
      title={editing ? 'Change the key' : `Key · ${subject}`}
      description={editing ? 'Changes apply straight away; the code stays the same.' : (accessKey?.note ?? undefined)}
    >
      {accessKey &&
        (editing ? (
          <KeyForm target={targetOf(accessKey)} accessKey={accessKey} onSaved={() => setEditing(false)} />
        ) : (
          <KeyBody accessKey={accessKey} subject={subject} openHref={openHref} onEdit={() => setEditing(true)} />
        ))}
    </FormDrawer>
  );
}

function KeyBody({ accessKey, subject, openHref, onEdit }: { accessKey: AccessKey; subject: string; openHref?: string; onEdit: () => void }) {
  const update = useUpdateKey();
  const code = formatKeyCode(accessKey.code);
  const link = keyLink(accessKey.code);
  const state = keyState(accessKey);
  const message = shareMessage(accessKey.kind as KeyKind, link, code);

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
        await navigator.share({ title: subject, text: message });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    await copy(message, 'Message with the link');
  };
  const switchTo = async (on: boolean) => {
    try {
      await update.mutateAsync({ key: accessKey, values: { switched_off_at: on ? null : new Date().toISOString() } });
      toast.success(on ? 'The key works again' : 'Switched off');
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-2">
      <div className={cn('rounded-xl border bg-muted/40 p-4 text-center', state !== 'working' && 'opacity-60')}>
        <p className={cn('font-mono text-3xl font-semibold tracking-widest select-all', state !== 'working' && 'line-through')}>{code}</p>
        <p className="mt-1 text-xs break-all text-muted-foreground select-all">{link}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {KEY_KIND_LABEL[accessKey.kind as KeyKind]}
          {accessKey.kind === 'website' && !accessKey.note && ' · Public'}
          {showsText(accessKey) && ` · ${showsText(accessKey)}`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{keyStatusText(accessKey)}</p>
      </div>
      {state === 'working' && (
        <>
          <Button size="lg" onClick={share}>
            <Share2 /> Send it
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
              <Eye /> See what they see
            </a>
          </Button>
        </>
      )}
      {state === 'expired' && <p className="text-center text-sm text-muted-foreground">It has expired. Change the end date to make it work again.</p>}
      <div className="flex flex-col gap-1 border-t pt-3">
        {openHref && (
          <Button variant="ghost" asChild>
            <Link to={openHref}>
              <ChevronRight /> Open {subject}
            </Link>
          </Button>
        )}
        <Button variant="ghost" onClick={onEdit}>
          <Pencil /> Change name, end date{accessKey.kind === 'website' ? ', what it shows' : accessKey.kind === 'job' ? '' : ', buyer / owner'}
        </Button>
        {state === 'off' ? (
          <Button variant="outline" disabled={update.isPending} onClick={() => switchTo(true)}>
            <Power /> Switch on again
          </Button>
        ) : (
          <ConfirmButton
            variant="ghost"
            className="text-destructive"
            title="Switch this key off?"
            description="It stops opening the page straight away. You can switch it on again later."
            confirmLabel="Switch off"
            onConfirm={() => switchTo(false)}
          >
            <Power /> Switch off
          </ConfirmButton>
        )}
      </div>
    </div>
  );
}

/** On a job page. */
export function CustomerAccessCard({ jobId, jobRef, customerName }: { jobId: string; jobRef: string; customerName?: string }) {
  return <KeysCard target={{ jobId }} subject={jobRef} defaultNote={customerName} />;
}
