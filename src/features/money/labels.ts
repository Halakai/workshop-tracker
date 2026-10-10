import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Banknote,
  Car,
  Handshake,
  Package,
  Receipt,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export const CATEGORY_INFO: Record<string, { label: string; icon: LucideIcon }> = {
  deposit: { label: 'Deposit', icon: ArrowDownToLine },
  withdrawal: { label: 'Withdrawal', icon: ArrowUpFromLine },
  transfer: { label: 'Transfer', icon: ArrowLeftRight },
  settlement: { label: 'Settle up', icon: Handshake },
  workshop_expense: { label: 'Workshop expense', icon: Receipt },
  other_income: { label: 'Other income', icon: Banknote },
  stock_purchase: { label: 'Stock purchase', icon: Package },
  car_purchase: { label: 'Car purchase', icon: Car },
  car_part: { label: 'Car part', icon: Wrench },
  car_cost: { label: 'Car cost', icon: Receipt },
  car_sale: { label: 'Car sale', icon: Banknote },
};

export function categoryInfo(category: string) {
  return CATEGORY_INFO[category] ?? { label: category, icon: Receipt };
}

/** Entries the Money page can edit itself; car and stock entries are edited where they belong. */
export const DIRECT_CATEGORIES = ['deposit', 'withdrawal', 'transfer'] as const;
export const WORKSHOP_CATEGORIES = ['workshop_expense', 'other_income'] as const;
