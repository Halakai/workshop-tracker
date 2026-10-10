import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppLogo } from '@/components/AppLogo';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { signOut } from '@/features/auth/AuthProvider';
import { syncErrorMessage } from '@/lib/errors';

function CenteredScreen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      {children}
    </div>
  );
}

export function SplashScreen() {
  return (
    <CenteredScreen>
      <AppLogo className="size-14" />
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </CenteredScreen>
  );
}

export function NotConfiguredScreen() {
  return (
    <CenteredScreen>
      <AppLogo className="size-14" />
      <h1 className="text-xl font-semibold">Not connected to a database yet</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (see the README) and rebuild.
      </p>
    </CenteredScreen>
  );
}

export function NoAccessScreen({ email }: { email?: string }) {
  return (
    <CenteredScreen>
      <AppLogo className="size-14" />
      <h1 className="text-xl font-semibold">No access</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {email ? <strong>{email}</strong> : 'This account'} is not an active member of this workshop. Ask the admin to
        set up or re-enable your account.
      </p>
      <Button variant="outline" onClick={() => signOut()}>
        Sign out
      </Button>
    </CenteredScreen>
  );
}

export function ErrorScreen({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <CenteredScreen>
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{syncErrorMessage(error)}</p>
      <Button onClick={onRetry}>Try again</Button>
    </CenteredScreen>
  );
}

export function ComingSoonPage({ title, milestone }: { title: string; milestone: string }) {
  return (
    <>
      <PageHeader title={title} />
      <PageBody>
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {title} arrives in milestone {milestone}.
        </div>
      </PageBody>
    </>
  );
}

/** Sends an old address (e.g. #/stock/…) to where that page lives now (#/inventory/…). */
export function LegacyRedirect({ from, to }: { from: string; to: string }) {
  const { pathname, search } = useLocation();
  return <Navigate to={to + pathname.slice(from.length) + search} replace />;
}

export function NotFoundPage() {
  return (
    <CenteredScreen>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Button asChild>
        <Link to="/">Go home</Link>
      </Button>
    </CenteredScreen>
  );
}
