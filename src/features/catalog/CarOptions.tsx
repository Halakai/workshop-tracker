// How car catalogue suggestions look on the suggestion chips of the car and job forms.
import { CarLogo } from '@/components/CarLogo';
import { cn } from '@/lib/utils';

export function MakeOption({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <CarLogo make={name} className="size-6 rounded-md p-0.5 text-[10px]" />
      {name}
    </span>
  );
}

export function GenerationOption({ name, info }: { name: string; info: { years: string; fits: boolean } | null }) {
  return (
    <span className={cn('flex flex-col items-start leading-tight', info && !info.fits && 'opacity-60')}>
      <span>{name}</span>
      {info?.years && <span className="text-[11px] font-normal text-muted-foreground">{info.years}</span>}
    </span>
  );
}

export function EngineOption({ name, fuel }: { name: string; fuel: string | null }) {
  return (
    <span className="flex flex-col items-start leading-tight">
      <span>{name}</span>
      {fuel && <span className="text-[11px] font-normal text-muted-foreground">{fuel}</span>}
    </span>
  );
}
