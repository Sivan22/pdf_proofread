import { useState } from 'react';
import { ChevronDown, ChevronLeft, ListChecks } from 'lucide-react';
import type { BatchProgress } from '../runner/orchestrator';
import { Card } from './ui/card';
import { ProgressLog } from './ProgressLog';

interface Props {
  batches: Map<number, BatchProgress>;
}

export function CollapsibleLogs({ batches }: Props) {
  const [open, setOpen] = useState(false);
  if (batches.size === 0) return null;
  const list = [...batches.values()];
  const done = list.filter((b) => b.status === 'done' || b.status === 'error').length;
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 rounded-xl px-6 py-3 text-start text-sm font-medium hover:bg-accent/40"
      >
        <span className="flex items-center gap-2">
          <ListChecks className="size-4" />
          יומן הרצה ({done} / {list.length})
        </span>
        {open ? <ChevronDown className="size-4" /> : <ChevronLeft className="size-4" />}
      </button>
      {open && (
        <div className="px-2 pb-3">
          <ProgressLog batches={batches} />
        </div>
      )}
    </Card>
  );
}
