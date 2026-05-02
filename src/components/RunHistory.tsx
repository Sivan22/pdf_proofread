import { useState } from 'react';
import { ChevronDown, ChevronLeft, History, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import type { RunRecord } from '../store/runHistory';
import { formatUsd } from '../lib/cost';

interface Props {
  history: RunRecord[];
  onClear: () => void;
}

export function RunHistory({ history, onClear }: Props) {
  const [open, setOpen] = useState(false);
  if (history.length === 0) return null;
  const total = history.reduce((sum, r) => sum + r.totalUsd, 0);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 rounded-xl px-6 py-3 text-start text-sm font-medium hover:bg-accent/40"
      >
        <span className="flex items-center gap-2">
          <History className="size-4" />
          היסטוריית ריצות ({history.length}) · סה"כ {formatUsd(total)}
        </span>
        {open ? <ChevronDown className="size-4" /> : <ChevronLeft className="size-4" />}
      </button>
      {open && (
        <div className="px-4 pb-4">
          <ul className="m-0 max-h-64 list-none space-y-1 overflow-y-auto p-0 text-xs">
            {history.map((r) => (
              <li
                key={r.timestamp}
                className="flex items-center gap-2 rounded-md border border-border/50 px-2 py-1"
              >
                <span className="grow truncate font-medium" title={r.fileName}>
                  {r.fileName}
                </span>
                <span className="text-muted-foreground">{r.pageRange}</span>
                <span className="text-muted-foreground">{r.model}</span>
                <span className="font-mono">{formatUsd(r.totalUsd)}</span>
                <span
                  className="text-[10px] text-muted-foreground"
                  title={new Date(r.timestamp).toLocaleString()}
                >
                  {new Date(r.timestamp).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={onClear}>
              <Trash2 className="me-1 size-3.5" />
              נקה
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
