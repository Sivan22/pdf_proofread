import { Receipt } from 'lucide-react';
import type { BatchProgress } from '../runner/orchestrator';
import { sumCallCosts } from '../ai/pricing';
import { PRICING_VERSION } from '../ai/pricing';
import { Card, CardContent } from './ui/card';
import { formatTokens, formatUsd } from '../lib/cost';

interface Props {
  batches: Map<number, BatchProgress>;
}

/**
 * Cumulative cost panel for the current run. Renders only once at least one
 * batch has settled with usage data. Shows a per-class breakdown plus a total
 * and labels the total as either gateway-exact (USD debited by Vercel AI
 * Gateway) or estimated (computed locally from public list prices).
 */
export function CostSummary({ batches }: Props) {
  const costs = [...batches.values()]
    .map((b) => b.cost)
    .filter((c): c is NonNullable<typeof c> => !!c);
  if (costs.length === 0) return null;
  const total = sumCallCosts(costs);

  const rows: Array<[string, number, number | null]> = [
    ['קלט', total.inputUsd, total.tokens.input],
    ['קלט מ-cache', total.cachedReadUsd, total.tokens.cachedRead],
    ['כתיבת cache', total.cacheWriteUsd, total.tokens.cacheWrite],
    ['פלט', total.outputUsd, total.tokens.output],
  ];

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Receipt className="size-4" />
          <span>עלות הריצה</span>
          <span className="ms-auto text-base">{formatUsd(total.totalUsd)}</span>
        </div>
        <table className="w-full text-xs">
          <tbody>
            {rows.map(([label, usd, tokens]) => {
              if ((tokens ?? 0) === 0 && usd === 0) return null;
              return (
                <tr key={label} className="leading-6">
                  <td className="text-muted-foreground">{label}</td>
                  <td className="text-end font-mono">
                    {tokens != null && tokens > 0 ? `${formatTokens(tokens)} tok` : ''}
                  </td>
                  <td className="text-end font-mono ps-3">{formatUsd(usd)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-2 text-[11px] text-muted-foreground">
          {total.source === 'gateway-exact' ? (
            <>סכום מדויק לפי Vercel AI Gateway.</>
          ) : (
            <>הערכה לפי מחירון פומבי (גרסה {PRICING_VERSION}). יתכן שינוי בעת עדכון תעריפים.</>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
