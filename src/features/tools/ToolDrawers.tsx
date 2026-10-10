// The quick changes on a tool's page: lend it out, its condition, "no longer have it", and paying for it.
import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { FormDrawer } from '@/components/FormDrawer';
import { DateField } from '@/components/DateField';
import { SuggestionInput } from '@/components/SuggestionInput';
import { PayerPicker } from '@/components/PayerPicker';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatMoney } from '@/domain/money';
import { sharesAreComplete } from '@/domain/shares';
import { todayIso } from '@/domain/dates';
import { GONE_REASONS, TOOL_CONDITIONS, type GoneReason, type ToolCondition } from '@/domain/tools';
import { syncErrorMessage } from '@/lib/errors';
import { getLastPayer, setLastPayer, useDefaultShares, usePayerOptions } from '@/features/money/accounts';
import { useSaveTool, useSaveToolPayment, useToolSuggestions, type Tool } from './api';

const chipClass = 'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground';

export function LendDrawer({ tool, open, onOpenChange }: { tool: Tool; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title={`Lend ${tool.name}`}>
      {open && <LendForm tool={tool} onDone={() => onOpenChange(false)} />}
    </FormDrawer>
  );
}

function LendForm({ tool, onDone }: { tool: Tool; onDone: () => void }) {
  const save = useSaveTool();
  const { borrowers } = useToolSuggestions();
  const [to, setTo] = useState('');
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = to.trim();
    if (!name) {
      setError('Who has it?');
      return;
    }
    try {
      await save.mutateAsync({ id: tool.id, values: { lent_to: name.slice(0, 80), lent_on: date } });
      toast.success(`${tool.name} is with ${name}`);
      onDone();
    } catch (err) {
      toast.error(syncErrorMessage(err));
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <FieldGroup>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="lend-to">Who has it</FieldLabel>
          <SuggestionInput
            id="lend-to"
            value={to}
            onChange={(v) => {
              setTo(v);
              setError(null);
            }}
            options={borrowers}
            placeholder="A partner, customer or friend"
            autoFocus
          />
          <FieldError errors={error ? [{ message: error }] : []} />
        </Field>
        <Field>
          <FieldLabel htmlFor="lend-date">Since</FieldLabel>
          <DateField id="lend-date" value={date} onChange={setDate} />
        </Field>
        <Button type="submit" size="lg" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />}
          Lend
        </Button>
      </FieldGroup>
    </form>
  );
}

export function ConditionDrawer({ tool, open, onOpenChange }: { tool: Tool; open: boolean; onOpenChange: (open: boolean) => void }) {
  const save = useSaveTool();
  const choose = async (condition: ToolCondition) => {
    if (condition === tool.condition) {
      onOpenChange(false);
      return;
    }
    try {
      await save.mutateAsync({ id: tool.id, values: { condition } });
      toast.success('Saved');
      onOpenChange(false);
    } catch (err) {
      toast.error(syncErrorMessage(err));
    }
  };
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title={`How is the ${tool.name.toLowerCase()}?`}>
      <div className="flex flex-col gap-2">
        {TOOL_CONDITIONS.map((c) => (
          <Button
            key={c.value}
            size="lg"
            variant={c.value === tool.condition ? 'default' : 'outline'}
            disabled={save.isPending}
            onClick={() => choose(c.value)}
          >
            {c.label}
          </Button>
        ))}
      </div>
    </FormDrawer>
  );
}

export function GoneDrawer({ tool, open, onOpenChange }: { tool: Tool; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="No longer have it"
      description="The tool stays on record (with its history) but leaves the list of tools you own."
    >
      {open && <GoneForm tool={tool} onDone={() => onOpenChange(false)} />}
    </FormDrawer>
  );
}

function GoneForm({ tool, onDone }: { tool: Tool; onDone: () => void }) {
  const save = useSaveTool();
  const [reason, setReason] = useState<GoneReason | ''>('');
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) {
      setError('What happened to it?');
      return;
    }
    try {
      // whoever had it borrowed doesn't have it any more either
      await save.mutateAsync({ id: tool.id, values: { gone_reason: reason, gone_on: date, lent_to: null, lent_on: null } });
      toast.success(reason === 'sold' ? 'Saved. Got money for it? Add it in Money as other income.' : 'Saved');
      onDone();
    } catch (err) {
      toast.error(syncErrorMessage(err));
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <FieldGroup>
        <Field data-invalid={!!error}>
          <FieldLabel>What happened</FieldLabel>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={2}
            className="flex flex-wrap"
            value={reason}
            onValueChange={(v) => {
              setReason(v as GoneReason);
              setError(null);
            }}
          >
            {GONE_REASONS.map((r) => (
              <ToggleGroupItem key={r.value} value={r.value} className={chipClass}>
                {r.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <FieldError errors={error ? [{ message: error }] : []} />
        </Field>
        <Field>
          <FieldLabel htmlFor="gone-date">When</FieldLabel>
          <DateField id="gone-date" value={date} onChange={setDate} />
        </Field>
        <Button type="submit" size="lg" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </FieldGroup>
    </form>
  );
}

/** Puts a workshop tool's price into Money as a workshop expense (or changes who paid). */
export function PaymentDrawer({ tool, open, onOpenChange }: { tool: Tool; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={tool.payment ? 'Who paid for it' : 'Add the purchase to Money'}
      description={`A workshop expense of ${formatMoney(tool.price_cents ?? 0)} (cost type Tools), split between partners by their profit shares.`}
    >
      {open && <PaymentForm tool={tool} onDone={() => onOpenChange(false)} />}
    </FormDrawer>
  );
}

function PaymentForm({ tool, onDone }: { tool: Tool; onDone: () => void }) {
  const payers = usePayerOptions();
  const shares = useDefaultShares();
  const pay = useSaveToolPayment();
  const last = getLastPayer();
  const [payer, setPayer] = useState<string | null>(
    tool.payment?.from_account_id ?? (payers.some((p) => p.accountId === last) ? last : (payers[0]?.accountId ?? null)),
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payer) return;
    if (!sharesAreComplete(shares)) {
      toast.error('Default profit shares don’t add up to 100 %. An admin can fix this under More → Users & partners.');
      return;
    }
    try {
      await pay.mutateAsync({ toolId: tool.id, accountId: payer, amount: tool.price_cents ?? 0, shares });
      setLastPayer(payer);
      toast.success('Saved in Money');
      onDone();
    } catch (err) {
      toast.error(syncErrorMessage(err));
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel>Who paid?</FieldLabel>
          <PayerPicker options={payers} value={payer} onChange={setPayer} />
        </Field>
        <Button type="submit" size="lg" disabled={pay.isPending || !payer}>
          {pay.isPending && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </FieldGroup>
    </form>
  );
}
