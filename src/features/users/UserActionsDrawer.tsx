import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { KeyRound, Loader2, Pencil, ShieldCheck, ShieldOff, UserCheck, UserX } from 'lucide-react';
import { FormDrawer } from '@/components/FormDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { useCurrentProfile } from '@/features/auth/profiles';
import { generateTempPassword } from '@/lib/password';
import { useAdminAction, type AdminUser } from './api';
import { TempPasswordInput } from './PasswordInput';

type Mode = 'menu' | 'rename' | 'password' | 'confirm-disable';

export function UserActionsDrawer({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('menu');
  const close = () => {
    onClose();
    setMode('menu');
  };
  if (!user) return null;

  return (
    <FormDrawer open={!!user} onOpenChange={(open) => !open && close()} title={user.display_name} description={user.email}>
      {mode === 'menu' && <ActionMenu user={user} onMode={setMode} onDone={close} />}
      {mode === 'rename' && <RenameForm user={user} onDone={close} />}
      {mode === 'password' && <PasswordForm user={user} onDone={close} />}
      {mode === 'confirm-disable' && <ConfirmDisable user={user} onDone={close} onCancel={() => setMode('menu')} />}
    </FormDrawer>
  );
}

function ActionMenu({ user, onMode, onDone }: { user: AdminUser; onMode: (m: Mode) => void; onDone: () => void }) {
  const me = useCurrentProfile();
  const action = useAdminAction();
  const isSelf = user.id === me.id;

  const run = async (body: Parameters<typeof action.mutateAsync>[0], success: string) => {
    try {
      await action.mutateAsync(body);
      toast.success(success);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" size="lg" className="justify-start" onClick={() => onMode('rename')}>
        <Pencil /> Rename
      </Button>
      <Button variant="outline" size="lg" className="justify-start" onClick={() => onMode('password')}>
        <KeyRound /> Set a new password
      </Button>
      {user.role === 'member' ? (
        <Button
          variant="outline"
          size="lg"
          className="justify-start"
          disabled={action.isPending}
          onClick={() => run({ action: 'set_role', user_id: user.id, role: 'admin' }, `${user.display_name} is now an admin`)}
        >
          <ShieldCheck /> Make admin
        </Button>
      ) : (
        <Button
          variant="outline"
          size="lg"
          className="justify-start"
          disabled={action.isPending}
          onClick={() => run({ action: 'set_role', user_id: user.id, role: 'member' }, `${user.display_name} is now a member`)}
        >
          <ShieldOff /> Make member (remove admin)
        </Button>
      )}
      {!isSelf &&
        (user.is_active ? (
          <Button variant="destructive" size="lg" className="justify-start" onClick={() => onMode('confirm-disable')}>
            <UserX /> Disable account
          </Button>
        ) : (
          <Button
            variant="outline"
            size="lg"
            className="justify-start"
            disabled={action.isPending}
            onClick={() => run({ action: 'set_active', user_id: user.id, active: true }, `${user.display_name} can sign in again`)}
          >
            <UserCheck /> Enable account
          </Button>
        ))}
    </div>
  );
}

const renameSchema = z.object({ display_name: z.string().trim().min(1, 'Name is required').max(60) });

function RenameForm({ user, onDone }: { user: AdminUser; onDone: () => void }) {
  const action = useAdminAction();
  const form = useForm({ resolver: zodResolver(renameSchema), defaultValues: { display_name: user.display_name } });
  const onSubmit = form.handleSubmit(async ({ display_name }) => {
    try {
      await action.mutateAsync({ action: 'rename', user_id: user.id, display_name });
      toast.success('Name saved');
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    }
  });
  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={!!form.formState.errors.display_name}>
          <FieldLabel htmlFor="rename">Name</FieldLabel>
          <Input id="rename" {...form.register('display_name')} />
          <FieldError errors={[form.formState.errors.display_name]} />
        </Field>
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </FieldGroup>
    </form>
  );
}

const passwordSchema = z.object({ password: z.string().min(8, 'At least 8 characters').max(72) });

function PasswordForm({ user, onDone }: { user: AdminUser; onDone: () => void }) {
  const action = useAdminAction();
  const form = useForm({ resolver: zodResolver(passwordSchema), defaultValues: { password: generateTempPassword() } });
  const onSubmit = form.handleSubmit(async ({ password }) => {
    try {
      await action.mutateAsync({ action: 'set_password', user_id: user.id, password });
      toast.success(`New password set for ${user.display_name}`);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    }
  });
  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={!!form.formState.errors.password}>
          <FieldLabel htmlFor="reset-password">New password</FieldLabel>
          <TempPasswordInput
            id="reset-password"
            {...form.register('password')}
            onGenerate={(p) => form.setValue('password', p, { shouldValidate: true })}
          />
          <FieldError errors={[form.formState.errors.password]} />
        </Field>
        <p className="text-sm text-muted-foreground">
          Write it down before saving and give it to {user.display_name}. They stay signed in on devices where they
          already are.
        </p>
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
          Set password
        </Button>
      </FieldGroup>
    </form>
  );
}

function ConfirmDisable({ user, onDone, onCancel }: { user: AdminUser; onDone: () => void; onCancel: () => void }) {
  const action = useAdminAction();
  return (
    <div className="flex flex-col gap-3">
      <p>
        <strong>{user.display_name}</strong> won't be able to sign in or see any data. Everything they recorded stays.
        You can enable the account again later.
      </p>
      <Button
        variant="destructive"
        size="lg"
        disabled={action.isPending}
        onClick={async () => {
          try {
            await action.mutateAsync({ action: 'set_active', user_id: user.id, active: false });
            toast.success(`${user.display_name} is disabled`);
            onDone();
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      >
        {action.isPending && <Loader2 className="animate-spin" />}
        Disable account
      </Button>
      <Button variant="ghost" size="lg" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
