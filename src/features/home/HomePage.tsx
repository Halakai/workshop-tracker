import { Link } from 'react-router';
import { Car, Package, Users, Wrench } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { useCurrentProfile } from '@/features/auth/profiles';

// The real dashboard (wallet, partners, cars in progress, low stock, quick actions) comes in M7.
export function HomePage() {
  const me = useCurrentProfile();
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
