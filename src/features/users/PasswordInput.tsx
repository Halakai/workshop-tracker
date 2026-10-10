import type { ComponentProps } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { generateTempPassword } from '@/lib/password';

/** Visible (not masked) temporary password with a "generate" button: the admin has to pass it on anyway. */
export function TempPasswordInput({
  onGenerate,
  ...props
}: ComponentProps<typeof Input> & { onGenerate: (password: string) => void }) {
  return (
    <div className="flex gap-2">
      <Input type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} className="font-mono" {...props} />
      <Button type="button" variant="outline" size="icon" aria-label="Generate password" onClick={() => onGenerate(generateTempPassword())}>
        <RefreshCw />
      </Button>
    </div>
  );
}
