import { Link } from 'react-router';
import { ChevronRight, LogOut, UserRound, Users, type LucideIcon } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { useCurrentProfile } from '@/features/auth/profiles';
import { signOut } from '@/features/auth/AuthProvider';
import { formatDateTime } from '@/domain/dates';

interface MoreLink {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export function MorePage() {
  const me = useCurrentProfile();
  const links: MoreLink[] = [
    { to: '/account', label: 'My account', description: 'Name and password', icon: UserRound },
    ...(me.role === 'admin'
      ? [{ to: '/users', label: 'Users & partners', description: 'Accounts, roles, profit shares', icon: Users }]
      : []),
  ];

  return (
    <>
      <PageHeader title="More" />
      <PageBody>
        <ul className="divide-y overflow-hidden rounded-xl border">
          {links.map(({ to, label, description, icon: Icon }) => (
            <li key={to}>
              <Link to={to} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-muted">
                <Icon className="size-5 text-muted-foreground" />
                <span className="flex-1">
                  <span className="block font-medium">{label}</span>
                  <span className="block text-sm text-muted-foreground">{description}</span>
                </span>
                <ChevronRight className="size-5 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
        <Button variant="outline" size="lg" onClick={() => signOut()}>
          <LogOut /> Sign out
        </Button>
        <p className="text-center text-xs text-muted-foreground">Version {formatDateTime(__BUILD_TIME__)}</p>
      </PageBody>
    </>
  );
}
