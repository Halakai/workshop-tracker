import { Link } from 'react-router';
import { AlertTriangle, Car, ChevronRight, Package, Users, Wallet, Wrench } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/domain/money';
import { cn } from '@/lib/utils';
import { usePartnerPositions, useWalletBalance } from '@/features/money/api';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { formatQuantity, toMilli } from '@/domain/quantity';
import { useCurrentProfile } from '@/features/auth/profiles';
import { unitOf, useLowStockItems } from '@/features/inventory/api';

// The full dashboard (wallet, partners, cars in progress, quick actions) comes in M7.
export function HomePage() {
  const me = useCurrentProfile();
  const lowStock = useLowStockItems();
  const wallet = useWalletBalance();
  const partners = usePartnerPositions();
  const links = [
    { to: '/stock', label: 'Stock', icon: Package },
    { to: '/cars', label: 'Cars', icon: Car },
    { to: '/jobs', label: 'Jobs', icon: Wrench },
    ...(me.role === 'admin' ? [{ to: '/users', label: 'Users', icon: Users }] : []),
  ];
  return (
    <>
      <PageHeader title="Workshop" />
      <PageBody>
        <p className="text-lg">
          Hi <span className="font-semibold">{me.display_name}</span> 👋
        </p>

        <Link to="/money">
          <Card className="active:bg-muted">
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Wallet className="size-4" /> Wallet
                  </p>
                  {wallet === null ? (
                    <Skeleton className="mt-1 h-8 w-32" />
                  ) : (
                    <p className={cn('text-2xl font-semibold tabular-nums', wallet < 0 && 'text-destructive')}>{formatMoney(wallet)}</p>
                  )}
                </div>
                <ChevronRight className="size-5 text-muted-foreground" />
              </div>
              {partners && partners.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {partners.map((p) => (
                    <span key={p.partnerId}>
                      <span className="text-muted-foreground">{p.name}</span>{' '}
                      <span className={cn('font-medium tabular-nums', p.balance < 0 && 'text-destructive')}>{formatMoney(p.balance)}</span>
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </Link>

        {lowStock.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-destructive" /> Low stock ({lowStock.length})
              </CardTitle>
              <CardAction>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/stock/shopping-list">Shopping list</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y">
                {lowStock.slice(0, 5).map((item) => (
                  <li key={item.id}>
                    <Link to={`/stock/${item.id}`} className="flex items-center justify-between gap-2 py-2">
                      <span className="truncate">{item.name}</span>
                      <span className="flex items-center gap-1 text-sm font-semibold text-destructive tabular-nums">
                        {formatQuantity(toMilli(item.qty_on_hand), unitOf(item).name)}
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-3">
          {links.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to}>
              <Card className="transition-colors active:bg-muted">
                <CardContent className="flex flex-col items-center gap-2 py-4">
                  <Icon className="size-7 text-primary" />
                  <span className="font-medium">{label}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </PageBody>
    </>
  );
}
