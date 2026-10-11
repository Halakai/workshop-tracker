import { Link } from 'react-router';
import { ChevronRight, Globe } from 'lucide-react';
import { formatMoney } from '@/domain/money';
import { cn } from '@/lib/utils';
import { useWebsiteCar } from './api';

/** On a car's or job's page: whether it is on the public website; opens its listing. */
export function WebsiteCard({ target, forSale }: { target: { carId: string } | { jobId: string }; forSale?: number | null }) {
  const listing = useWebsiteCar(target);
  const to = 'carId' in target ? `/cars/${target.carId}/website` : `/jobs/${target.jobId}/website`;
  const shown = listing.data?.is_public ?? false;
  const state = !listing.data
    ? 'Not on the website. Tap to add it.'
    : shown
      ? forSale !== undefined
        ? `On the website, for sale${forSale != null ? ` at ${formatMoney(forSale)}` : ''}`
        : 'On the website'
      : 'Not shown (texts kept)';
  return (
    <Link to={to} className="flex min-h-16 items-center gap-3 rounded-xl border px-4 py-3 active:bg-muted">
      <Globe className={cn('size-5', shown ? 'text-primary' : 'text-muted-foreground')} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">Website</span>
        <span className="block text-sm text-muted-foreground">{listing.isPending ? '…' : state}</span>
      </span>
      <ChevronRight className="size-5 text-muted-foreground" />
    </Link>
  );
}
