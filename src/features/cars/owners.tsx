// Car owners in the app: who the people are, how an owner is named on cards and pages (docs/PLAN.md §13).
import { useMemo } from 'react';
import { Building2, Lock, User, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ownerLabel, WORKSHOP_OWNER, type CarOwnerFields, type OwnerPeople } from '@/domain/cars';
import { cn } from '@/lib/utils';
import { useCurrentProfile, useProfiles } from '@/features/auth/profiles';
import { useContacts } from '@/features/contacts/api';

/** Members (with an account), contacts and you: what the owner field chooses from. */
export function useOwnerPeople(): OwnerPeople & { ready: boolean } {
  const me = useCurrentProfile();
  const profiles = useProfiles();
  const contacts = useContacts();
  return useMemo(
    () => ({
      meId: me.id,
      members: profiles.data ?? [],
      contacts: contacts.data ?? [],
      ready: profiles.isSuccess && contacts.isSuccess,
    }),
    [me.id, profiles.data, profiles.isSuccess, contacts.data, contacts.isSuccess],
  );
}

/** A suggestion chip in the owner field: the workshop, a member (with "you"), or a contact. */
export function OwnerOption({ name, people }: { name: string; people: OwnerPeople }) {
  if (name === WORKSHOP_OWNER) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Building2 className="size-4" /> {name}
      </span>
    );
  }
  const member = people.members.find((m) => m.display_name === name);
  if (member) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <UserRound className="size-4 text-primary" /> {name}
        <span className="text-xs text-muted-foreground">{member.id === people.meId ? 'you' : 'member'}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <User className="size-4 text-muted-foreground" /> {name}
    </span>
  );
}

type OwnedCar = CarOwnerFields & { owner_contact?: { name: string } | null };

/** "Workshop", "Mine 🔒", "Marko's", "Ana Horvat" as a small badge. */
export function OwnerBadge({ car, people, className }: { car: OwnedCar; people: Pick<OwnerPeople, 'members' | 'meId'>; className?: string }) {
  const label = ownerLabel(car, { ...people, contactName: car.owner_contact?.name });
  const Icon = car.owner_kind === 'workshop' ? Building2 : car.owner_kind === 'member' ? UserRound : User;
  return (
    <Badge
      variant="outline"
      className={cn('max-w-40 gap-1', car.owner_kind === 'member' && car.owner_member_id === people.meId && 'border-primary/50', className)}
    >
      {car.is_private ? <Lock className="size-3" aria-label="Only you can see it" /> : <Icon className="size-3" />}
      <span className="truncate">{label}</span>
    </Badge>
  );
}
