import { Navigate, Outlet, useLocation } from 'react-router';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from './AuthProvider';
import { CurrentProfileContext, useCurrentProfile, useMeQuery } from './profiles';
import { ErrorScreen, NoAccessScreen, NotConfiguredScreen, SplashScreen } from '@/app/screens';

/** Gate for the whole signed-in app: session + an active profile in this app. */
export function RequireAuth() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const me = useMeQuery(session?.user.id);

  if (!isSupabaseConfigured) return <NotConfiguredScreen />;
  if (loading) return <SplashScreen />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (me.isPending) return <SplashScreen />;
  if (me.isError) return <ErrorScreen error={me.error} onRetry={() => me.refetch()} />;
  if (!me.data || !me.data.is_active) return <NoAccessScreen email={session.user.email} />;

  return (
    <CurrentProfileContext.Provider value={me.data}>
      <Outlet />
    </CurrentProfileContext.Provider>
  );
}

export function RequireAdmin() {
  const me = useCurrentProfile();
  if (me.role !== 'admin') {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Only an admin can open this page.
      </div>
    );
  }
  return <Outlet />;
}
