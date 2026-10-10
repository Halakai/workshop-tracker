import { useState } from 'react';
import { cn } from '@/lib/utils';
import { logoUrl, useMakeLogo } from '@/features/catalog/carCatalog';
import { codeLetters } from '@/domain/codes';

/**
 * A car make's logo on a small white tile (logos are made for light backgrounds, so the tile stays white in dark
 * mode too). Makes without a logo get their initials.
 */
export function CarLogo({ make, logo, className }: { make: string | null | undefined; logo?: string | null; className?: string }) {
  const found = useMakeLogo(logo === undefined ? make : null);
  const file = logo === undefined ? found : logo;
  const [broken, setBroken] = useState(false);
  const initials =
    (make ?? '')
      .split(/[\s-]+/)
      .filter(Boolean)
      .map((w) => codeLetters(w)[0] ?? '')
      .join('')
      .slice(0, 2) || '?';
  return (
    <span
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white p-1 text-xs font-bold text-neutral-600',
        className,
      )}
      aria-hidden
    >
      {file && !broken ? (
        <img src={logoUrl(file)} alt="" loading="lazy" className="max-h-full max-w-full object-contain" onError={() => setBroken(true)} />
      ) : (
        initials
      )}
    </span>
  );
}
