import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { FormDrawer } from '@/components/FormDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { CODE_PATTERN, deriveCode } from '@/domain/codes';
import { syncErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { catalogKeys, useBrands } from './api';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => CODE_PATTERN.test(v), '2–6 letters or digits'),
});

export function AddBrandDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const brands = useBrands();
  const queryClient = useQueryClient();
  const [codeEdited, setCodeEdited] = useState(false);
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { name: '', code: '' } });

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      form.reset();
      setCodeEdited(false);
    }
  };

  const onSubmit = form.handleSubmit(async (values) => {
    const { error } = await supabase.from('brands').insert(values);
    if (error) {
      toast.error(error.code === '23505' ? 'A brand with this name or code already exists.' : syncErrorMessage(error));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: catalogKeys.brands });
    toast.success(`Brand ${values.name} added`);
    close(false);
  });

  return (
    <FormDrawer open={open} onOpenChange={close} title="New brand" description="Names are case-sensitive: “BOSCH” and “Bosch” are different.">
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <Field data-invalid={!!form.formState.errors.name}>
            <FieldLabel htmlFor="brand-name">Name</FieldLabel>
            <Input
              id="brand-name"
              autoFocus
              {...form.register('name', {
                onChange: (e) => {
                  if (!codeEdited) {
                    form.setValue('code', e.target.value.trim() ? deriveCode(e.target.value, (brands.data ?? []).map((b) => b.code), 4) : '');
                  }
                },
              })}
            />
            <FieldError errors={[form.formState.errors.name]} />
          </Field>
          <Field data-invalid={!!form.formState.errors.code}>
            <FieldLabel htmlFor="brand-code">Code</FieldLabel>
            <Input id="brand-code" className="font-mono uppercase" autoCapitalize="characters" {...form.register('code', { onChange: () => setCodeEdited(true) })} />
            <FieldDescription>Used in part numbers, e.g. FLD-CAST-001.</FieldDescription>
            <FieldError errors={[form.formState.errors.code]} />
          </Field>
          <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
            Add brand
          </Button>
        </FieldGroup>
      </form>
    </FormDrawer>
  );
}
