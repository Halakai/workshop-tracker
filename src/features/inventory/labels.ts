import { ClipboardCheck, PackagePlus, Undo2, Wrench, Car, type LucideIcon } from 'lucide-react';
import type { Enums } from '@/lib/database.types';

export type MovementKind = Enums<'movement_type'>;

export const MOVEMENT_LABELS: Record<MovementKind, { label: string; icon: LucideIcon }> = {
  purchase: { label: 'Bought', icon: PackagePlus },
  use_car: { label: 'Used on car', icon: Car },
  use_job: { label: 'Used on job', icon: Wrench },
  overhead: { label: 'Used in workshop', icon: Wrench },
  adjustment: { label: 'Adjusted', icon: ClipboardCheck },
  return: { label: 'Returned to stock', icon: Undo2 },
};
