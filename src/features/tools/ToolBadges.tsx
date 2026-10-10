import { Badge } from '@/components/ui/badge';
import { conditionLabel, goneLabel } from '@/domain/tools';
import { cn } from '@/lib/utils';
import type { Tool } from './api';

/** What needs attention about a tool: who has it, whether it works, whether we still have it. */
export function ToolBadges({ tool, className }: { tool: Pick<Tool, 'lent_to' | 'condition' | 'gone_reason'>; className?: string }) {
  return (
    <span className={cn('flex flex-wrap justify-end gap-1', className)}>
      {tool.gone_reason && <Badge variant="secondary">{goneLabel(tool.gone_reason).toLowerCase()}</Badge>}
      {tool.lent_to && !tool.gone_reason && (
        <Badge variant="outline" className="max-w-36 border-primary/40 text-primary">
          <span className="truncate">at {tool.lent_to}</span>
        </Badge>
      )}
      {tool.condition === 'needs_repair' && <Badge className="bg-warning/25 text-foreground">{conditionLabel(tool.condition).toLowerCase()}</Badge>}
      {tool.condition === 'broken' && <Badge variant="destructive">{conditionLabel(tool.condition).toLowerCase()}</Badge>}
    </span>
  );
}
