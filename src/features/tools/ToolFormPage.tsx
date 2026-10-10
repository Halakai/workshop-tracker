import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { SuffixInput } from '@/components/SuffixInput';
import { SuggestionInput } from '@/components/SuggestionInput';
import { DateField } from '@/components/DateField';
import { PayerPicker } from '@/components/PayerPicker';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Checkbox } from '@/components/Checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { centsToInput, formatMoney, parseMoney } from '@/domain/money';
import { partNumberTaken } from '@/domain/codes';
import { sharesAreComplete } from '@/domain/shares';
import { nextToolCode, TOOL_CONDITIONS, type ToolCondition } from '@/domain/tools';
import { syncErrorMessage } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { useProfiles } from '@/features/auth/profiles';
import { ensureBrand, useBrands, useToolCategories } from '@/features/catalog/api';
import { getLastPayer, setLastPayer, useDefaultShares, usePayerOptions } from '@/features/money/accounts';
import { useDeleteTool, useSaveTool, useSaveToolPayment, useTool, useToolSuggestions, useTools, type Tool } from './api';

const WORKSHOP = 'workshop';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  category_id: z.string().min(1, 'Pick a category'),
  brand: z.string().trim().max(60),
  model: z.string().trim().max(80),
  code: z.string().trim().min(1, 'The ID is required').max(20),
  serial_number: z.string().trim().max(80),
  qty: z.string(),
  owner: z.string(),
  location: z.string().trim().max(80),
  condition: z.enum(['good', 'needs_repair', 'broken']),
  bought_on: z.string(),
  price: z.string(),
  bought_from: z.string().trim().max(80),
  warranty_until: z.string(),
  notes: z.string().max(2000),
  addToMoney: z.boolean(),
  paidBy: z.string().nullable(),
});
type Values = z.infer<typeof schema>;

export function ToolFormPage() {
  const { id } = useParams();
  const existing = useTool(id);
  const categories = useToolCategories();
  const brands = useBrands();
  if ((id && existing.isPending) || categories.isPending || brands.isPending) {
    return (
      <>
        <PageHeader title={id ? 'Edit tool' : 'New tool'} back />
        <PageBody>
          <Skeleton className="h-96 rounded-xl" />
        </PageBody>
      </>
    );
  }
  return <ToolForm tool={id ? existing.data : undefined} />;
}

function ToolForm({ tool }: { tool?: Tool }) {
  const navigate = useNavigate();
  const goBack = useGoBack();
  const save = useSaveTool();
  const pay = useSaveToolPayment();
  const remove = useDeleteTool();
  const tools = useTools();
  const categories = useToolCategories().data ?? [];
  const brands = useBrands().data ?? [];
  const partners = (useProfiles().data ?? []).filter((p) => p.is_active || p.id === tool?.owner_id);
  const payers = usePayerOptions();
  const shares = useDefaultShares();
  const suggestions = useToolSuggestions();
  // new tools: the ID is the next free one until you type your own
  const [codeEdited, setCodeEdited] = useState(Boolean(tool));
  const linked = tool?.payment ?? null;

  const defaultValues = useMemo<Values>(() => {
    const last = getLastPayer();
    return {
      name: tool?.name ?? '',
      category_id: tool?.category_id ?? categories[0]?.id ?? '',
      brand: tool?.brand?.name ?? '',
      model: tool?.model ?? '',
      code: tool?.code ?? '',
      serial_number: tool?.serial_number ?? '',
      qty: String(tool?.qty ?? 1),
      owner: tool?.owner_id ?? WORKSHOP,
      location: tool?.location ?? '',
      condition: (tool?.condition as ToolCondition | undefined) ?? 'good',
      bought_on: tool?.bought_on ?? '',
      price: tool?.price_cents != null ? centsToInput(tool.price_cents) : '',
      bought_from: tool?.bought_from ?? '',
      warranty_until: tool?.warranty_until ?? '',
      notes: tool?.notes ?? '',
      addToMoney: false,
      paidBy: payers.some((p) => p.accountId === last) ? last : (payers[0]?.accountId ?? null),
    };
    // categories / payers only matter for a new tool's first render
  }, [tool]);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues });
  const err = form.formState.errors;

  const otherCodes = useMemo(() => (tools.data ?? []).filter((t) => t.id !== tool?.id).map((t) => t.code), [tools.data, tool?.id]);
  const suggestedCode = nextToolCode(otherCodes);
  useEffect(() => {
    if (!codeEdited && tools.data) form.setValue('code', suggestedCode);
  }, [codeEdited, suggestedCode, tools.data, form]);
  // payers load after the form on a cold start
  useEffect(() => {
    if (!form.getValues('paidBy') && payers[0]) form.setValue('paidBy', payers[0].accountId);
  }, [payers.length]);

  const owner = form.watch('owner');
  const priceText = form.watch('price');
  const addToMoney = form.watch('addToMoney');
  const price = priceText.trim() ? parseMoney(priceText) : null;
  const canPay = owner === WORKSHOP && price !== null && price > 0;

  const onSubmit = form.handleSubmit(async (v) => {
    const qty = Number(v.qty.trim());
    if (!Number.isInteger(qty) || qty < 1 || qty > 9999) {
      form.setError('qty', { message: 'A whole number, 1 or more' });
      return;
    }
    const priceCents = v.price.trim() ? parseMoney(v.price) : null;
    if (v.price.trim() && priceCents === null) {
      form.setError('price', { message: 'Enter an amount, e.g. 120 or 120.50' });
      return;
    }
    if (linked && !priceCents) {
      form.setError('price', { message: 'The purchase is in Money. Take it out there (on the tool’s page) before removing the price.' });
      return;
    }
    if (partNumberTaken(v.code, otherCodes)) {
      form.setError('code', { message: 'Already used by another tool' });
      return;
    }
    const payNow = v.owner === WORKSHOP && Boolean(priceCents) && (linked !== null || v.addToMoney);
    if (payNow && !linked && !v.paidBy) {
      form.setError('paidBy', { message: 'Who paid?' });
      return;
    }
    if (payNow && !sharesAreComplete(shares)) {
      toast.error('Default profit shares don’t add up to 100 %. An admin can fix this under More → Users & partners.');
      return;
    }

    let saved;
    try {
      const brand = v.brand ? await ensureBrand(v.brand) : null;
      saved = await save.mutateAsync({
        id: tool?.id,
        values: {
          name: v.name,
          category_id: v.category_id,
          brand_id: brand?.id ?? null,
          model: v.model || null,
          code: v.code.toUpperCase(),
          serial_number: v.serial_number || null,
          qty,
          owner_id: v.owner === WORKSHOP ? null : v.owner,
          location: v.location || null,
          condition: v.condition,
          bought_on: v.bought_on || null,
          price_cents: priceCents,
          bought_from: v.bought_from || null,
          warranty_until: v.warranty_until || null,
          notes: v.notes.trim() || null,
        },
      });
    } catch (e) {
      toast.error(syncErrorMessage(e));
      return;
    }

    // the purchase in Money follows the tool (new entry, or the existing one with the new price / date / seller)
    if (payNow) {
      const accountId = linked?.from_account_id ?? v.paidBy!;
      try {
        await pay.mutateAsync({ toolId: saved.id, accountId, amount: priceCents!, shares });
        if (!linked) setLastPayer(accountId);
      } catch (e) {
        toast.error(`The tool is saved, but Money wasn’t updated: ${syncErrorMessage(e)}`);
      }
    }
    toast.success(tool ? 'Saved' : `${saved.name} added (${saved.code})`);
    if (tool) goBack(`/inventory/tools/${tool.id}`);
    else navigate(`/inventory/tools/${saved.id}`, { replace: true });
  });

  const deleteTool = async () => {
    if (!tool) return;
    try {
      await remove.mutateAsync(tool.id);
      toast.success('Deleted');
      goBack('/inventory/tools', 2);
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };

  const chipClass = 'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground';
  const chips = (name: 'category_id' | 'owner' | 'condition', options: { value: string; label: string; disabled?: boolean }[]) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <ToggleGroup type="single" variant="outline" spacing={2} className="flex flex-wrap" value={field.value} onValueChange={(v) => v && field.onChange(v)}>
          {options.map((o) => (
            <ToggleGroupItem key={o.value} value={o.value} disabled={o.disabled} className={chipClass}>
              {o.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    />
  );
  const suggestField = (name: 'location' | 'bought_from', id: string, options: string[], placeholder: string) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => <SuggestionInput id={id} value={field.value} onChange={field.onChange} options={options} placeholder={placeholder} />}
    />
  );

  return (
    <>
      <PageHeader title={tool ? `Edit ${tool.code}` : 'New tool'} back />
      <PageBody>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <FieldSet>
              <FieldLegend>Tool</FieldLegend>
              <FieldGroup>
                <Field data-invalid={!!err.name}>
                  <FieldLabel htmlFor="tool-name">Name</FieldLabel>
                  <Input id="tool-name" placeholder="e.g. Cordless impact wrench" autoFocus={!tool} {...form.register('name')} />
                  <FieldError errors={[err.name]} />
                </Field>

                <Field data-invalid={!!err.category_id}>
                  <FieldLabel>Category</FieldLabel>
                  {chips(
                    'category_id',
                    categories.map((c) => ({ value: c.id, label: c.name })),
                  )}
                  <FieldDescription>
                    Missing one? Add it under{' '}
                    <Link to="/lists" className="text-primary underline">
                      More → Lists
                    </Link>
                    .
                  </FieldDescription>
                  <FieldError errors={[err.category_id]} />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="tool-brand">Brand</FieldLabel>
                    <Controller
                      control={form.control}
                      name="brand"
                      render={({ field }) => (
                        <SuggestionInput
                          id="tool-brand"
                          value={field.value}
                          onChange={field.onChange}
                          options={brands.map((b) => b.name)}
                          placeholder="e.g. Makita"
                          newHint={(v) => `“${v}” will be added to the brands list.`}
                        />
                      )}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="tool-model">Model</FieldLabel>
                    <Input id="tool-model" placeholder="e.g. DTW285" {...form.register('model')} />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field data-invalid={!!err.code}>
                    <FieldLabel htmlFor="tool-code">Tool ID</FieldLabel>
                    <div className="flex gap-2">
                      <Input
                        id="tool-code"
                        className="font-mono uppercase"
                        autoCapitalize="characters"
                        {...form.register('code', { onChange: () => setCodeEdited(true) })}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Generate tool ID"
                        onClick={() => {
                          setCodeEdited(false);
                          form.setValue('code', suggestedCode, { shouldValidate: true });
                        }}
                      >
                        <RefreshCw />
                      </Button>
                    </div>
                    <FieldError errors={[err.code]} />
                  </Field>
                  <Field data-invalid={!!err.qty}>
                    <FieldLabel htmlFor="tool-qty">How many</FieldLabel>
                    <SuffixInput id="tool-qty" suffix="pcs" inputMode="numeric" {...form.register('qty')} />
                    <FieldError errors={[err.qty]} />
                  </Field>
                </div>
                <FieldDescription className="-mt-3">The ID is filled in automatically (handy on a sticker); you can change it.</FieldDescription>

                <Field>
                  <FieldLabel htmlFor="tool-serial">Serial number</FieldLabel>
                  <Input id="tool-serial" className="font-mono placeholder:font-sans" placeholder="For warranty and if it gets stolen" {...form.register('serial_number')} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="tool-location">Where it’s kept</FieldLabel>
                  {suggestField('location', 'tool-location', suggestions.locations, 'e.g. Wall rack, Red toolbox')}
                </Field>

                <Field>
                  <FieldLabel>Belongs to</FieldLabel>
                  {chips('owner', [
                    { value: WORKSHOP, label: 'Workshop' },
                    // a tool paid with workshop money is the workshop's
                    ...partners.map((p) => ({ value: p.id, label: p.display_name, disabled: linked !== null })),
                  ])}
                  <FieldDescription>
                    {linked ? 'Paid with workshop money, so it belongs to the workshop.' : 'A partner’s own tool kept in the workshop stays theirs.'}
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel>Condition</FieldLabel>
                  {chips('condition', TOOL_CONDITIONS)}
                </Field>
              </FieldGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Purchase</FieldLegend>
              <FieldGroup>
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="tool-bought">Bought on</FieldLabel>
                    <Controller
                      control={form.control}
                      name="bought_on"
                      render={({ field }) => (
                        <DateField id="tool-bought" value={field.value} onChange={field.onChange} placeholder="Not set" onClear={() => field.onChange('')} />
                      )}
                    />
                  </Field>
                  <Field data-invalid={!!err.price}>
                    <FieldLabel htmlFor="tool-price">Price</FieldLabel>
                    <SuffixInput id="tool-price" suffix="€" inputMode="decimal" {...form.register('price')} />
                  </Field>
                </div>
                <FieldError errors={[err.price]} className="-mt-3" />
                <Field>
                  <FieldLabel htmlFor="tool-from">Bought from</FieldLabel>
                  {suggestField('bought_from', 'tool-from', suggestions.sellers, 'Shop or person')}
                </Field>
                <Field>
                  <FieldLabel htmlFor="tool-warranty">Warranty until</FieldLabel>
                  <Controller
                    control={form.control}
                    name="warranty_until"
                    render={({ field }) => (
                      <DateField
                        id="tool-warranty"
                        value={field.value}
                        onChange={field.onChange}
                        max={null}
                        placeholder="No warranty / not known"
                        onClear={() => field.onChange('')}
                      />
                    )}
                  />
                </Field>

                {linked ? (
                  <p className="rounded-lg bg-muted px-3 py-2 text-sm">
                    In Money as a workshop expense of {formatMoney(linked.amount_cents)}. Changes to the price, date and seller update it.
                  </p>
                ) : (
                  canPay && (
                    <>
                      <Field orientation="horizontal">
                        <Controller
                          control={form.control}
                          name="addToMoney"
                          render={({ field }) => <Checkbox id="tool-money" checked={field.value} onChange={field.onChange} />}
                        />
                        <FieldLabel htmlFor="tool-money" className="font-normal">
                          Bought with workshop money: add {formatMoney(price!)} to Money as a workshop expense
                        </FieldLabel>
                      </Field>
                      {addToMoney && (
                        <Field data-invalid={!!err.paidBy}>
                          <FieldLabel>Who paid?</FieldLabel>
                          <Controller
                            control={form.control}
                            name="paidBy"
                            render={({ field }) => <PayerPicker options={payers} value={field.value} onChange={field.onChange} />}
                          />
                          <FieldError errors={[err.paidBy]} />
                        </Field>
                      )}
                    </>
                  )
                )}
              </FieldGroup>
            </FieldSet>

            <Field>
              <FieldLabel htmlFor="tool-notes">Notes</FieldLabel>
              <Textarea id="tool-notes" placeholder="Sizes in the set, accessories, what to watch out for…" {...form.register('notes')} />
            </Field>
            <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              {tool ? 'Save' : 'Add tool'}
            </Button>
          </FieldGroup>
        </form>

        {tool && (
          <div className="mt-4 flex flex-col gap-2 border-t pt-4">
            <ConfirmButton
              variant="destructive"
              title={`Delete ${tool.name}?`}
              description={
                <>
                  Only for tools added by mistake: the tool and its details disappear. Sold, lost or thrown away? Use “Gone” on its page instead, which keeps
                  the record.
                  {linked && ' Its purchase stays in Money; take it out there if it was a mistake too.'}
                </>
              }
              confirmLabel="Delete"
              onConfirm={deleteTool}
            >
              <Trash2 /> Delete tool
            </ConfirmButton>
          </div>
        )}
      </PageBody>
    </>
  );
}
