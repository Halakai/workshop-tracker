import { Link } from 'react-router';
import {
  BookOpen,
  BookUser,
  ChevronRight,
  DatabaseBackup,
  Globe,
  History,
  KeyRound,
  ListChecks,
  LogOut,
  Settings,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
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
  const groups: { title: string; links: MoreLink[] }[] = [
    {
      title: 'Workshop',
      links: [
        { to: '/money', label: 'Money', description: 'Wallet, overview, partners', icon: Wallet },
        { to: '/manuals', label: 'Repair manuals', description: 'Services and repairs, for any car', icon: BookOpen },
        { to: '/contacts', label: 'Contacts', description: 'Sellers, buyers and customers', icon: BookUser },
        { to: '/activity', label: 'Activity', description: 'Who did what', icon: History },
      ],
    },
    {
      title: 'Customers',
      links: [
        { to: '/keys', label: 'Keys', description: 'Codes for customers and visitors', icon: KeyRound },
        { to: '/website', label: 'Website', description: 'Cars, texts, contacts, hours', icon: Globe },
      ],
    },
    {
      title: 'Settings',
      links: [
        { to: '/account', label: 'My account', description: 'Name and password', icon: UserRound },
        { to: '/lists', label: 'Lists', description: 'Car makes, categories, brands, suppliers…', icon: ListChecks },
        ...(me.role === 'admin'
          ? [
              { to: '/users', label: 'Users & partners', description: 'Accounts, roles, profit shares', icon: Users },
              { to: '/settings', label: 'Workshop settings', description: 'Name, logo, invoice, Google Drive', icon: Settings },
              { to: '/export', label: 'Backup & restore', description: 'Save all data to a file, or load it', icon: DatabaseBackup },
            ]
          : []),
      ],
    },
  ];

  return (
    <>
      <PageHeader title="More" />
      <PageBody>
        {groups.map((g) => (
          <section key={g.title} className="flex flex-col gap-2">
            <h2 className="px-1 text-sm font-medium text-muted-foreground">{g.title}</h2>
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {g.links.map(({ to, label, description, icon: Icon }) => (
                <li key={to}>
                  <Link to={to} className="flex min-h-14 items-center gap-3 px-4 py-2.5 active:bg-muted">
                    <Icon className="size-5 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{label}</span>
                      <span className="block truncate text-sm text-muted-foreground">{description}</span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <Button variant="outline" size="lg" onClick={() => signOut()}>
          <LogOut /> Sign out
        </Button>
        <p className="text-center text-xs text-muted-foreground">Version {formatDateTime(__BUILD_TIME__)}</p>
      </PageBody>
    </>
  );
}
