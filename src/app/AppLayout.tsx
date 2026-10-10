import { Suspense } from 'react';
import { Outlet } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { BottomNav } from './BottomNav';

function PagePlaceholder() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-32 rounded-xl" />
      <Skeleton className="h-16 rounded-xl" />
    </div>
  );
}

export function AppLayout() {
  return (
    <div className="min-h-dvh pb-[calc(4rem+env(safe-area-inset-bottom)+1rem)]">
      <Suspense fallback={<PagePlaceholder />}>
        <Outlet />
      </Suspense>
      <BottomNav />
    </div>
  );
}
