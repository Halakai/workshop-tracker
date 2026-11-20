import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { AppLogo } from '@/components/AppLogo';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { syncErrorMessage } from '@/lib/errors';
import { formatKeyCode, keyPageHref, normalizeKeyCode, rememberedKeys } from '@/lib/customerKeys';
import { NotConfiguredScreen } from '@/app/screens';
import { useAuth } from './AuthProvider';

const schema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});
type Values = z.infer<typeof schema>;

export function LoginPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  if (!isSupabaseConfigured) return <NotConfiguredScreen />;
  if (!loading && session) return <Navigate to={from} replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email.trim(),
      password: values.password,
    });
    if (error) {
      setError(syncErrorMessage(error));
      return;
    }
    navigate(from, { replace: true });
  });

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <AppLogo className="size-16" />
          <h1 className="text-2xl font-semibold">Workshop Tracker</h1>
        </div>

        <CustomerCode />

        <div className="my-8 flex items-center gap-3 text-xs text-muted-foreground uppercase">
          <span className="h-px flex-1 bg-border" /> Workshop team <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field data-invalid={!!form.formState.errors.email}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                inputMode="email"
                autoCapitalize="none"
                aria-invalid={!!form.formState.errors.email}
                {...form.register('email')}
              />
              <FieldError errors={[form.formState.errors.email]} />
            </Field>
            <Field data-invalid={!!form.formState.errors.password}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!form.formState.errors.password}
                {...form.register('password')}
              />
              <FieldError errors={[form.formState.errors.password]} />
            </Field>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Sign in
            </Button>
          </FieldGroup>
        </form>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Forgot your password? Ask the admin to set a new one.
        </p>
      </div>
    </div>
  );
}

/**
 * Customers (docs/PLAN.md §11): the code they got from the workshop opens their page (view.html#/k/<code>/).
 * In Croatian first, since that's who gets the codes. A phone that opened a code before offers it again.
 */
function CustomerCode() {
  const [code, setCode] = useState('');
  const remembered = rememberedKeys()[0];
  const open = (c: string) => window.location.assign(keyPageHref(c));
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="font-semibold">Imate kod? · Have a code?</h2>
        <p className="text-sm text-muted-foreground">Kod ste dobili od radionice. · The workshop gave you a code.</p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const c = normalizeKeyCode(code);
          if (c) open(c);
        }}
      >
        <Input
          aria-label="Kod · Code"
          placeholder="K7M4-QX9P"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={12}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="font-mono tracking-widest uppercase"
        />
        <Button type="submit" disabled={!normalizeKeyCode(code)}>
          Otvori · Open
        </Button>
      </form>
      {remembered && (
        <Button variant="secondary" onClick={() => open(remembered)}>
          Moj posao · My page ({formatKeyCode(remembered)})
        </Button>
      )}
    </div>
  );
}
