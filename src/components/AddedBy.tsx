import { formatDate } from '@/domain/dates';
import { useProfileNames } from '@/features/auth/profiles';

/** "added by David, 12.03.2026" */
export function AddedBy({ by, at, verb = 'added' }: { by: string | null; at: string; verb?: string }) {
  const names = useProfileNames();
  const name = by ? (names.get(by) ?? 'someone') : 'setup';
  return (
    <p className="text-xs text-muted-foreground">
      {verb} by {name}, {formatDate(at)}
    </p>
  );
}
