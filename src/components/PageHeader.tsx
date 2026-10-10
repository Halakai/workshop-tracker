import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PageHeaderProps {
  title: string;
  /** Show a back button: a path to go to, or true for browser back. */
  back?: string | true;
  actions?: ReactNode;
}

export function PageHeader({ title, back, actions }: PageHeaderProps) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-14 max-w-2xl items-center gap-1 px-2">
        {back ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back"
            onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
          >
            <ChevronLeft className="size-6" />
          </Button>
        ) : (
          <span className="w-2" />
        )}
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h1>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>
    </header>
  );
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4">{children}</div>;
}
