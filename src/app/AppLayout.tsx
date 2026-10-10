import { Outlet } from 'react-router';
import { BottomNav } from './BottomNav';

export function AppLayout() {
  return (
    <div className="min-h-dvh pb-[calc(4rem+env(safe-area-inset-bottom)+1rem)]">
      <Outlet />
      <BottomNav />
    </div>
  );
}
