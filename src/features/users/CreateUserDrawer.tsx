import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Check, Copy, Loader2 } from 'lucide-react';
import { FormDrawer } from '@/components/FormDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { generateTempPassword } from '@/lib/password';
import { useAdminAction } from './api';
import { TempPasswordInput } from './PasswordInput';

const schema = z.object({
  display_name: z.string().trim().min(1, 'Name is required').max(60),
  email: z.email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters').max(72),
  role: z.enum(['member', 'admin']),
});
type Values = z.infer<typeof schema>;

export function CreateUserDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const action = useAdminAction();
  const [created, setCreated] = useState<Values | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { display_name: '', email: '', password: generateTempPassword(), role: 'member' },
  });

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setCreated(null);
      form.reset({ display_name: '', email: '', password: generateTempPassword(), role: 'member' });
    }
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await action.mutateAsync({ action: 'create', ...values, email: values.email.trim().toLowerCase() });
      setCreated(values);
    } catch (e) {
      toast.error((e as Error).message);
    }
  });

  return (
    <FormDrawer
      open={open}
      onOpenChange={close}
      title={created ? 'Account created' : 'Add user'}
      description={created ? undefined : 'They sign in with this email and password and can change the password later.'}
    >
      {created ? (
        <CreatedSummary values={created} onDone={() => close(false)} />
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field data-invalid={!!form.formState.errors.display_name}>
              <FieldLabel htmlFor="new-name">Name</FieldLabel>
              <Input id="new-name" autoComplete="off" {...form.register('display_name')} />
              <FieldError errors={[form.formState.errors.display_name]} />
            </Field>
            <Field data-invalid={!!form.formState.errors.email}>
              <FieldLabel htmlFor="new-email">Email</FieldLabel>
              <Input id="new-email" type="email" inputMode="email" autoCapitalize="none" autoComplete="off" {...form.register('email')} />
              <FieldError errors={[form.formState.errors.email]} />
            </Field>
            <Field data-invalid={!!form.formState.errors.password}>
              <FieldLabel htmlFor="new-password">Temporary password</FieldLabel>
              <TempPasswordInput
                id="new-password"
                {...form.register('password')}
                onGenerate={(p) => form.setValue('password', p, { shouldValidate: true })}
              />
              <FieldError errors={[form.formState.errors.password]} />
            </Field>
            <Field>
              <FieldLabel>Role</FieldLabel>
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => (
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    className="w-full"
                    value={field.value}
                    onValueChange={(v) => v && field.onChange(v)}
                  >
                    <ToggleGroupItem value="member" className="flex-1">Member</ToggleGroupItem>
                    <ToggleGroupItem value="admin" className="flex-1">Admin</ToggleGroupItem>
                  </ToggleGroup>
                )}
              />
              <FieldDescription>Admins can also manage users, settings and backups.</FieldDescription>
            </Field>
            <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Create account
            </Button>
          </FieldGroup>
        </form>
      )}
    </FormDrawer>
  );
}

function CreatedSummary({ values, onDone }: { values: Values; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Workshop Tracker\n${window.location.origin}${window.location.pathname}\nEmail: ${values.email}\nPassword: ${values.password}`;
  return (
    <div className="flex flex-col gap-4">
      <p>
        Send these to <strong>{values.display_name}</strong>. They can change the password under More → My account.
      </p>
      <pre className="rounded-lg bg-muted p-3 font-mono text-sm whitespace-pre-wrap">{text}</pre>
      <Button
        variant="outline"
        size="lg"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        }}
      >
        {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
      </Button>
      <p className="text-sm text-muted-foreground">
        New partners start with a 0 % default profit share. Adjust the shares on this page.
      </p>
      <Button size="lg" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
