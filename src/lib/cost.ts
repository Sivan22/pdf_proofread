/**
 * Format a USD amount for display. Uses 4 fractional digits below $1 so that
 * tiny per-call costs (which often run in fractions of a cent) stay readable,
 * and 2 digits above. Always shows a leading `$`.
 */
export function formatUsd(usd: number): string {
  if (!Number.isFinite(usd)) return '$0.00';
  const abs = Math.abs(usd);
  const fractionDigits = abs >= 1 ? 2 : 4;
  return `$${usd.toFixed(fractionDigits)}`;
}

export function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
