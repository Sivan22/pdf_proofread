import { Check, X } from 'lucide-react';
import type { BatchProgress } from '../runner/orchestrator';
import { Card, CardContent } from './ui/card';

interface Props {
  batches: Map<number, BatchProgress>;
}

export function ProgressLog({ batches }: Props) {
  if (batches.size === 0) return null;
  const list = [...batches.values()].sort((a, b) => a.index - b.index);
  const done = list.filter((b) => b.status === 'done' || b.status === 'error').length;
  const totalErrors = list.reduce((sum, b) => sum + (b.errorsFound ?? 0), 0);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-2 text-sm font-medium">
          {done} / {list.length} קבוצות · {totalErrors} טעויות
        </div>
        <ul className="m-0 max-h-52 list-none overflow-y-auto p-0">
          {list.map((b) => (
            <li key={b.index} className="font-mono text-xs leading-6">
              <Row b={b} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function rangeText(b: BatchProgress): string {
  return b.pageNums.length === 1
    ? `עמוד ${b.pageNums[0] + 1}`
    : `עמודים ${b.pageNums[0] + 1}-${b.pageNums[b.pageNums.length - 1] + 1}`;
}

function Row({ b }: { b: BatchProgress }) {
  const range = rangeText(b);
  switch (b.status) {
    case 'queued':
      return <span className="text-muted-foreground">• {range} · ממתין</span>;
    case 'running':
      return <span>• {range} · רץ…</span>;
    case 'done':
      return (
        <span className="inline-flex items-center gap-1.5">
          <Check className="size-3.5 text-primary" />
          {range} · {b.errorsFound ?? 0} טעויות
        </span>
      );
    case 'error':
      return (
        <span className="inline-flex items-center gap-1.5 text-destructive">
          <X className="size-3.5" />
          {range} · {b.errorMessage ?? 'שגיאה'}
        </span>
      );
  }
}
