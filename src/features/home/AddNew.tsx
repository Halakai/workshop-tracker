import { useState } from 'react';
import { Link } from 'react-router';
import { Car, ChevronRight, Hammer, MinusCircle, Package, Plus, ReceiptEuro, ShoppingCart, Wrench, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormDrawer } from '@/components/FormDrawer';
import type { Item } from '@/features/inventory/api';
import { MoneyEntryDrawer } from '@/features/money/MoneyEntryDrawer';
import { ItemPicker } from '@/features/cars/CarStockDrawers';
import { UseDrawer } from '@/features/inventory/UseDrawer';
import { BuyDrawer } from '@/features/inventory/BuyDrawer';

type Step = 'menu' | 'expense' | 'pick-use' | 'pick-buy' | null;

interface Choice {
  icon: LucideIcon;
  label: string;
  note: string;
  to?: string;
  step?: Exclude<Step, 'menu' | null>;
}

const CHOICES: Choice[] = [
  { icon: Wrench, label: 'Job', note: 'A customer’s car', to: '/jobs/new' },
  { icon: Car, label: 'Car', note: 'A car of ours, to repair and sell', to: '/cars/new' },
  { icon: ReceiptEuro, label: 'Expense', note: 'Something paid for the workshop', step: 'expense' },
  { icon: ShoppingCart, label: 'Part bought', note: 'More of a part we already have', step: 'pick-buy' },
  { icon: MinusCircle, label: 'Part used', note: 'Taken from the shelf', step: 'pick-use' },
  { icon: Package, label: 'New part', note: 'A part we don’t have in the list yet', to: '/inventory/new' },
  { icon: Hammer, label: 'Tool', note: 'A tool we own', to: '/inventory/tools/new' },
];

/** One button for adding anything. */
export function AddNew() {
  const [step, setStep] = useState<Step>(null);
  const [useItem, setUseItem] = useState<Item | null>(null);
  const [buyItem, setBuyItem] = useState<Item | null>(null);
  // the pop-up closes first: two at once would share one press of the phone's back button
  const closeThen = (open: () => void) => {
    setStep(null);
    setTimeout(open, 200);
  };
  const close = (open: boolean) => !open && setStep(null);

  return (
    <>
      <Button size="lg" className="h-14 rounded-2xl text-lg" onClick={() => setStep('menu')}>
        <Plus className="size-6" /> Add new
      </Button>

      <FormDrawer
        open={step === 'menu' || step === 'pick-use' || step === 'pick-buy'}
        onOpenChange={close}
        title={step === 'pick-buy' ? 'Which part did you buy?' : step === 'pick-use' ? 'Which part did you use?' : 'Add new'}
      >
        {(step === 'pick-use' || step === 'pick-buy') && (
          <ItemPicker
            includeEmpty={step === 'pick-buy'}
            onPick={(item) => closeThen(() => (step === 'pick-buy' ? setBuyItem(item) : setUseItem(item)))}
          />
        )}
        {step === 'menu' && (
          <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
            {CHOICES.map(({ icon: Icon, label, note, to, step: next }) => {
              const content = (
                <>
                  <Icon className="size-6 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-medium">{label}</span>
                    <span className="block truncate text-sm text-muted-foreground">{note}</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                </>
              );
              const className = 'flex min-h-16 w-full items-center gap-4 px-4 py-2.5 text-left active:bg-muted';
              return (
                <li key={label}>
                  {to ? (
                    <Link to={to} className={className}>
                      {content}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className={className}
                      onClick={() => (next === 'expense' ? closeThen(() => setStep('expense')) : setStep(next ?? null))}
                    >
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </FormDrawer>

      <MoneyEntryDrawer mode={step === 'expense' ? 'expense' : null} onClose={() => setStep(null)} />
      {useItem && <UseDrawer item={useItem} open onOpenChange={(o) => !o && setUseItem(null)} />}
      {buyItem && <BuyDrawer item={buyItem} open onOpenChange={(o) => !o && setBuyItem(null)} />}
    </>
  );
}
