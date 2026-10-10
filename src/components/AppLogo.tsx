import { Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AppLogo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center rounded-2xl bg-primary text-primary-foreground', className)}>
      <Wrench className="size-1/2" strokeWidth={2.25} />
    </div>
  );
}
