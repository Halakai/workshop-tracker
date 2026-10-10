import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronRight, Loader2, Phone, Search, Trash2 } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { FormDrawer } from '@/components/FormDrawer';
import { ConfirmButton } from '@/components/ConfirmButton';
import { AddedBy } from '@/components/AddedBy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { supabase } from '@/lib/supabase';
import { syncErrorMessage } from '@/lib/errors';
import { useCurrentProfile } from '@/features/auth/profiles';
import { useCars } from '@/features/cars/api';
import { useJobs } from '@/features/jobs/api';
import { contactKeys, useContacts, type Contact } from './api';

/** Sellers, buyers and customers. Members add and edit; admins delete unused ones. */
export function ContactsPage() {
  const contacts = useContacts();
  const cars = useCars();
  const jobs = useJobs();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Contact | null>(null);

  const usage = useMemo(() => {
    const map = new Map<string, string[]>();
    const add = (id: string | null | undefined, text: string) => id && map.set(id, [...(map.get(id) ?? []), text]);
    for (const c of cars.data ?? []) {
      add(c.seller_id, `sold us ${c.ref}`);
      add(c.buyer_id, `bought ${c.ref}`);
    }
    for (const j of jobs.data ?? []) add(j.customer_id, j.ref);
    return map;
  }, [cars.data, jobs.data]);

  const visible = (contacts.data ?? []).filter((c) =>
    [c.name, c.phone].filter(Boolean).join(' ').toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <>
      <PageHeader title="Contacts" back="/more" />
      <PageBody>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" placeholder="Name or phone" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
        </div>
        <p className="text-xs text-muted-foreground">New contacts are added from cars and jobs when you type a new name.</p>
        {contacts.isPending && <Skeleton className="h-40 rounded-xl" />}
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border empty:hidden">
          {visible.map((c) => {
            const used = usage.get(c.id) ?? [];
            return (
              <li key={c.id} className="flex items-center gap-2 pr-2">
                <button type="button" onClick={() => setEditing(c)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left active:bg-muted">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[c.phone, used.slice(0, 4).join(', ')].filter(Boolean).join(' · ') || 'not used yet'}
                    </span>
                  </span>
                  <ChevronRight className="size-5 text-muted-foreground" />
                </button>
                {c.phone && (
                  <Button variant="outline" size="icon" asChild aria-label={`Call ${c.name}`}>
                    <a href={`tel:${c.phone.replace(/\s/g, '')}`}>
                      <Phone />
                    </a>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </PageBody>
      <ContactDrawer contact={editing} usedBy={editing ? (usage.get(editing.id)?.length ?? 0) : 0} onClose={() => setEditing(null)} />
    </>
  );
}

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  phone: z.string().trim().max(40),
  notes: z.string().max(1000),
});

function ContactDrawer({ contact, usedBy, onClose }: { contact: Contact | null; usedBy: number; onClose: () => void }) {
  return (
    <FormDrawer open={!!contact} onOpenChange={(o) => !o && onClose()} title={contact?.name ?? ''}>
      {contact && <ContactForm key={contact.id} contact={contact} usedBy={usedBy} onDone={onClose} />}
    </FormDrawer>
  );
}

function ContactForm({ contact, usedBy, onDone }: { contact: Contact; usedBy: number; onDone: () => void }) {
  const me = useCurrentProfile();
  const queryClient = useQueryClient();
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: contact.name, phone: contact.phone ?? '', notes: contact.notes ?? '' },
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: contactKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['cars'] }),
      queryClient.invalidateQueries({ queryKey: ['jobs'] }),
    ]);

  const onSubmit = form.handleSubmit(async (v) => {
    const { error } = await supabase.from('contacts').update({ name: v.name, phone: v.phone || null, notes: v.notes.trim() || null }).eq('id', contact.id);
    if (error) {
      toast.error(error.code === '23505' ? 'Another contact already has this name.' : syncErrorMessage(error));
      return;
    }
    await refresh();
    toast.success('Saved');
    onDone();
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={!!form.formState.errors.name}>
          <FieldLabel htmlFor="ct-name">Name</FieldLabel>
          <Input id="ct-name" {...form.register('name')} />
          <FieldError errors={[form.formState.errors.name]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="ct-phone">Phone</FieldLabel>
          <Input id="ct-phone" type="tel" inputMode="tel" {...form.register('phone')} />
        </Field>
        <Field>
          <FieldLabel htmlFor="ct-notes">Notes</FieldLabel>
          <Textarea id="ct-notes" rows={2} {...form.register('notes')} />
        </Field>
        <AddedBy by={contact.created_by} at={contact.created_at} />
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
          Save
        </Button>
        {me.role === 'admin' && usedBy === 0 && (
          <ConfirmButton
            variant="ghost"
            className="text-destructive"
            title={`Delete ${contact.name}?`}
            confirmLabel="Delete"
            onConfirm={async () => {
              const { data, error } = await supabase.from('contacts').delete().eq('id', contact.id).select();
              if (error || !data?.length) {
                toast.error(error ? syncErrorMessage(error) : 'Could not delete');
                return;
              }
              await refresh();
              toast.success('Deleted');
              onDone();
            }}
          >
            <Trash2 /> Delete contact
          </ConfirmButton>
        )}
      </FieldGroup>
    </form>
  );
}
