import { NavLink } from 'react-router';
import { Car, House, Menu, Package, Wrench, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLowStockItems } from '@/features/inventory/api';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

export function BottomNav() {
  const lowStock = useLowStockItems().length;
  const items: NavItem[] = [
    { to: '/', label: 'Home', icon: House },
    { to: '/inventory', label: 'Inventory', icon: Package, badge: lowStock },
    { to: '/cars', label: 'Cars', icon: Car },
    { to: '/jobs', label: 'Jobs', icon: Wrench },
    { to: '/more', label: 'More', icon: Menu },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-backdrop-filter:bg-background/85">
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {items.map(({ to, label, icon: Icon, badge }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground transition-colors',
                  isActive && 'text-primary',
                )
              }
            >
              <span className="relative">
                <Icon className="size-6" />
                {badge ? (
                  <span className="absolute -top-1.5 -right-2.5 min-w-5 rounded-full bg-destructive px-1 text-center text-[11px] leading-5 font-semibold text-white">
                    {badge > 99 ? '99+' : badge}
                  </span>
                ) : null}
              </span>
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
