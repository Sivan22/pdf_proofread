import type { BatchProgress } from '../runner/orchestrator';

interface Props {
  batches: Map<number, BatchProgress>;
}

export function ProgressLog({ batches }: Props) {
  if (batches.size === 0) return null;
  const list = [...batches.values()].sort((a, b) => a.index - b.index);
  const done = list.filter((b) => b.status === 'done' || b.status === 'error').length;
  const totalErrors = list.reduce((sum, b) => sum + (b.errorsFound ?? 0), 0);

  return (
    <section style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <div style={{ marginBottom: 8 }}>
        {done} / {list.length} קבוצות · {totalErrors} טעויות
      </div>
      <ul style={{ maxHeight: 200, overflowY: 'auto', listStyle: 'none', padding: 0, margin: 0 }}>
        {list.map((b) => (
          <li key={b.index} style={{ fontFamily: 'monospace', fontSize: 13 }}>
            {renderRow(b)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function renderRow(b: BatchProgress): string {
  const range = b.pageNums.length === 1
    ? `עמוד ${b.pageNums[0] + 1}`
    : `עמודים ${b.pageNums[0] + 1}-${b.pageNums[b.pageNums.length - 1] + 1}`;
  switch (b.status) {
    case 'queued': return `• ${range} · ממתין`;
    case 'running': return `• ${range} · רץ…`;
    case 'done': return `✓ ${range} · ${b.errorsFound ?? 0} טעויות`;
    case 'error': return `✗ ${range} · ${b.errorMessage ?? 'שגיאה'}`;
  }
}
