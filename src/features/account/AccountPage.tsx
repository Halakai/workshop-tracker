import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { profileKeys, useCurrentProfile } from '@/features/auth/profiles';
import { supabase } from '@/lib/supabase';
import { syncErrorMessage } from '@/lib/errors';
import { formatShare } from '@/domain/shares';

const nameSchema = z.object({ display_name: z.string().trim().min(1, 'Name is required').max(60) });

const passwordSchema = z
  .object({
    password: z.string().min(8, 'At least 8 characters').max(72),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: "Passwords don't match" });

export function AccountPage() {
  const me = useCurrentProfile();
  const queryClient = useQueryClient();

  const nameForm = useForm({ resolver: zodResolver(nameSchema), values: { display_name: me.display_name } });
  const passwordForm = useForm({ resolver: zodResolver(passwordSchema), defaultValues: { password: '', confirm: '' } });

  const saveName = nameForm.handleSubmit(async ({ display_name }) => {
    const { error } = await supabase.from('profiles').update({ display_name }).eq('id', me.id);
    if (error) return void toast.error(syncErrorMessage(error));
    await queryClient.invalidateQueries({ queryKey: profileKeys.me(me.id) });
    await queryClient.invalidateQueries({ queryKey: profileKeys.all });
    toast.success('Name saved');
  });

  const savePassword = passwordForm.handleSubmit(async ({ password }) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return void toast.error(syncErrorMessage(error));
    passwordForm.reset();
    toast.success('Password changed');
  });

  return (
    <>
      <PageHeader title="My account" back="/more" />
      <PageBody>
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{me.email}</span>
            <Badge variant={me.role === 'admin' ? 'default' : 'secondary'}>{me.role}</Badge>
            <span className="text-sm text-muted-foreground">Default profit share {formatShare(me.default_share_bp)}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Name</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveName} noValidate>
              <FieldGroup>
                <Field data-invalid={!!nameForm.formState.errors.display_name}>
                  <FieldLabel htmlFor="display_name">Shown as</FieldLabel>
                  <Input id="display_name" autoComplete="nickname" {...nameForm.register('display_name')} />
                  <FieldError errors={[nameForm.formState.errors.display_name]} />
                </Field>
                <Button type="submit" disabled={nameForm.formState.isSubmitting || !nameForm.formState.isDirty}>
                  {nameForm.formState.isSubmitting && <Loader2 className="animate-spin" />}
                  Save name
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={savePassword} noValidate>
              <FieldGroup>
                <Field data-invalid={!!passwordForm.formState.errors.password}>
                  <FieldLabel htmlFor="password">New password</FieldLabel>
                  <Input id="password" type="password" autoComplete="new-password" {...passwordForm.register('password')} />
                  <FieldDescription>At least 8 characters.</FieldDescription>
                  <FieldError errors={[passwordForm.formState.errors.password]} />
                </Field>
                <Field data-invalid={!!passwordForm.formState.errors.confirm}>
                  <FieldLabel htmlFor="confirm">Repeat new password</FieldLabel>
                  <Input id="confirm" type="password" autoComplete="new-password" {...passwordForm.register('confirm')} />
                  <FieldError errors={[passwordForm.formState.errors.confirm]} />
                </Field>
                <Button type="submit" disabled={passwordForm.formState.isSubmitting}>
                  {passwordForm.formState.isSubmitting && <Loader2 className="animate-spin" />}
                  Change password
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
