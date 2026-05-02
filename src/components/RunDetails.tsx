import { Check, X } from 'lucide-react';
import type { BatchProgress } from '../runner/orchestrator';
import { sumCallCosts, PRICING_VERSION } from '../ai/pricing';
import { formatTokens, formatUsd } from '../lib/cost';

interface Props {
  batches: Map<number, BatchProgress>;
}

/**
 * Compact logs + cost breakdown for the Review-tab sidebar. Combines
 * per-batch progress (one line each, with cost) and a per-class token
 * breakdown for the run total. Intentionally borderless — meant to be
 * mounted inside an existing bordered container.
 */
export function RunDetails({ batches }: Props) {
  const list = [...batches.values()].sort((a, b) => a.index - b.index);
  const settled = list.map((b) => b.cost).filter((c): c is NonNullable<typeof c> => !!c);
  const total = settled.length ? sumCallCosts(settled) : null;

  return (
    <div className="space-y-3 px-3 py-2 text-xs">
      <div>
        <div className="mb-1 font-medium">לפי עמוד</div>
        <ul className="m-0 max-h-48 list-none overflow-y-auto p-0 font-mono leading-6">
          {list.map((b) => (
            <li key={b.index}>
              <BatchRow b={b} />
            </li>
          ))}
        </ul>
      </div>

      {total && (
        <div>
          <div className="mb-1 flex items-baseline justify-between font-medium">
            <span>סיכום עלות</span>
            <span className="font-mono text-sm">{formatUsd(total.totalUsd)}</span>
          </div>
          <table className="w-full">
            <tbody>
              {(
                [
                  ['קלט', total.inputUsd, total.tokens.input],
                  ['קלט מ-cache', total.cachedReadUsd, total.tokens.cachedRead],
                  ['כתיבת cache', total.cacheWriteUsd, total.tokens.cacheWrite],
                  ['פלט', total.outputUsd, total.tokens.output],
                ] as Array<[string, number, number]>
              ).map(([label, usd, tokens]) => {
                if (tokens === 0 && usd === 0) return null;
                return (
                  <tr key={label} className="leading-5">
                    <td className="text-muted-foreground">{label}</td>
                    <td className="text-end font-mono">
                      {tokens > 0 ? `${formatTokens(tokens)} tok` : ''}
                    </td>
                    <td className="text-end font-mono ps-2">{formatUsd(usd)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {total.source === 'gateway-exact'
              ? 'מדויק לפי Vercel AI Gateway.'
              : `הערכה לפי מחירון (${PRICING_VERSION}).`}
          </div>
        </div>
      )}
    </div>
  );
}

function rangeText(b: BatchProgress): string {
  return b.pageNums.length === 1
    ? `עמוד ${b.pageNums[0] + 1}`
    : `עמ' ${b.pageNums[0] + 1}-${b.pageNums[b.pageNums.length - 1] + 1}`;
}

function BatchRow({ b }: { b: BatchProgress }) {
  const range = rangeText(b);
  switch (b.status) {
    case 'queued':
      return <span className="text-muted-foreground">• {range} · ממתין</span>;
    case 'running':
      return <span>• {range} · רץ…</span>;
    case 'done':
      return (
        <span className="inline-flex items-center gap-1.5">
          <Check className="size-3 text-primary" />
          {range} · {b.errorsFound ?? 0} טעויות
          {b.cost && (
            <span className="ms-auto text-muted-foreground">
              {formatUsd(b.cost.totalUsd)}
            </span>
          )}
        </span>
      );
    case 'error':
      return (
        <span className="inline-flex items-center gap-1.5 text-destructive">
          <X className="size-3" />
          {range} · {b.errorMessage ?? 'שגיאה'}
        </span>
      );
  }
}
