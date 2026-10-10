import { ClipboardCheck, PackagePlus, Undo2, Wrench, Car, type LucideIcon } from 'lucide-react';
import type { Enums } from '@/lib/database.types';

export type ItemCategory = Enums<'item_category'>;
export type MovementKind = Enums<'movement_type'>;

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  part: 'Part',
  consumable: 'Consumable',
  fluid: 'Fluid',
  other: 'Other',
};

export const CATEGORY_PLURALS: Record<ItemCategory, string> = {
  part: 'Parts',
  consumable: 'Consumables',
  fluid: 'Fluids',
  other: 'Other',
};

export const MOVEMENT_LABELS: Record<MovementKind, { label: string; icon: LucideIcon }> = {
  purchase: { label: 'Bought', icon: PackagePlus },
  use_car: { label: 'Used on car', icon: Car },
  use_job: { label: 'Used on job', icon: Wrench },
  overhead: { label: 'Used in workshop', icon: Wrench },
  adjustment: { label: 'Stock count', icon: ClipboardCheck },
  return: { label: 'Returned to stock', icon: Undo2 },
};

export const COUNT_REASONS = ['Stock count', 'Opening stock', 'Damaged', 'Lost', 'Found'];
