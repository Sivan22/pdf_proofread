import { describe, expect, it } from 'vitest';
import { computeCallCost, emptyCallCost, sumCallCosts } from './pricing';

// Mocks the LanguageModelUsage shape returned by AI SDK v6.
function usage(overrides: {
  noCache?: number;
  cacheRead?: number;
  cacheWrite?: number;
  output?: number;
  reasoning?: number;
}) {
  const noCache = overrides.noCache ?? 0;
  const cacheRead = overrides.cacheRead ?? 0;
  const cacheWrite = overrides.cacheWrite ?? 0;
  const output = overrides.output ?? 0;
  const reasoning = overrides.reasoning ?? 0;
  return {
    inputTokens: noCache,
    inputTokenDetails: {
      noCacheTokens: noCache,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
    },
    outputTokens: output,
    outputTokenDetails: { textTokens: output - reasoning, reasoningTokens: reasoning },
    totalTokens: noCache + cacheRead + cacheWrite + output,
  };
}

describe('computeCallCost — gateway route', () => {
  it('uses providerMetadata.gateway.cost as exact USD when present (string)', () => {
    const cost = computeCallCost({
      route: 'gateway',
      model: 'claude-opus-4-7',
      usage: usage({ noCache: 1000, output: 500 }),
      providerMetadata: { gateway: { cost: '0.0234' } },
    });
    expect(cost.source).toBe('gateway-exact');
    expect(cost.totalUsd).toBeCloseTo(0.0234, 6);
  });

  it('uses providerMetadata.gateway.cost as exact USD when present (number)', () => {
    const cost = computeCallCost({
      route: 'gateway',
      model: 'gemini-3.1-pro',
      usage: usage({ noCache: 2000, output: 1000 }),
      providerMetadata: { gateway: { cost: 0.0123 } },
    });
    expect(cost.source).toBe('gateway-exact');
    expect(cost.totalUsd).toBeCloseTo(0.0123, 6);
  });

  it('falls back to estimation if gateway cost is missing', () => {
    const cost = computeCallCost({
      route: 'gateway',
      model: 'claude-opus-4-7',
      usage: usage({ noCache: 1_000_000, output: 1_000_000 }),
      providerMetadata: { gateway: {} },
    });
    expect(cost.source).toBe('estimated');
    expect(cost.totalUsd).toBeCloseTo(5 + 25, 6);
  });
});

describe('computeCallCost — Anthropic direct (claude-opus-4-7)', () => {
  it('charges $5 / Mtok input and $25 / Mtok output', () => {
    const cost = computeCallCost({
      route: 'anthropic',
      model: 'claude-opus-4-7',
      usage: usage({ noCache: 1_000_000, output: 1_000_000 }),
      providerMetadata: undefined,
    });
    expect(cost.source).toBe('estimated');
    expect(cost.inputUsd).toBeCloseTo(5, 6);
    expect(cost.outputUsd).toBeCloseTo(25, 6);
    expect(cost.totalUsd).toBeCloseTo(30, 6);
  });

  it('charges cache reads at 10% of input ($0.50 / Mtok)', () => {
    const cost = computeCallCost({
      route: 'anthropic',
      model: 'claude-opus-4-7',
      usage: usage({ cacheRead: 1_000_000 }),
      providerMetadata: undefined,
    });
    expect(cost.cachedReadUsd).toBeCloseTo(0.5, 6);
    expect(cost.totalUsd).toBeCloseTo(0.5, 6);
  });

  it('charges 5-minute cache writes at 1.25× input ($6.25 / Mtok)', () => {
    const cost = computeCallCost({
      route: 'anthropic',
      model: 'claude-opus-4-7',
      usage: usage({ cacheWrite: 1_000_000 }),
      providerMetadata: undefined,
    });
    expect(cost.cacheWriteUsd).toBeCloseTo(6.25, 6);
    expect(cost.totalUsd).toBeCloseTo(6.25, 6);
  });

  it('sums all token classes for a realistic call', () => {
    const cost = computeCallCost({
      route: 'anthropic',
      model: 'claude-opus-4-7',
      usage: usage({
        noCache: 1000, cacheRead: 500, cacheWrite: 2000, output: 800, reasoning: 200,
      }),
      providerMetadata: undefined,
    });
    // 1000*5/1e6 + 500*0.5/1e6 + 2000*6.25/1e6 + 800*25/1e6
    const expected = 0.005 + 0.00025 + 0.0125 + 0.02;
    expect(cost.totalUsd).toBeCloseTo(expected, 8);
  });
});

describe('computeCallCost — Google direct (gemini-3.1-pro)', () => {
  it('uses standard rates ($2 / $12 per Mtok) below the 200k context threshold', () => {
    const cost = computeCallCost({
      route: 'google',
      model: 'gemini-3.1-pro',
      usage: usage({ noCache: 100_000, output: 50_000 }),
      providerMetadata: undefined,
    });
    expect(cost.inputUsd).toBeCloseTo(100_000 * 2 / 1_000_000, 8);
    expect(cost.outputUsd).toBeCloseTo(50_000 * 12 / 1_000_000, 8);
  });

  it('switches to long-context rates ($4 / $18) above the 200k input threshold', () => {
    const cost = computeCallCost({
      route: 'google',
      model: 'gemini-3.1-pro',
      usage: usage({ noCache: 250_000, output: 5_000 }),
      providerMetadata: undefined,
    });
    expect(cost.inputUsd).toBeCloseTo(250_000 * 4 / 1_000_000, 8);
    expect(cost.outputUsd).toBeCloseTo(5_000 * 18 / 1_000_000, 8);
  });

  it('keeps reasoning included in outputTokens (billed as output)', () => {
    const cost = computeCallCost({
      route: 'google',
      model: 'gemini-3.1-pro',
      usage: usage({ noCache: 1000, output: 5000, reasoning: 4000 }),
      providerMetadata: undefined,
    });
    // reasoning is part of outputTokens, so we don't double-count
    expect(cost.outputUsd).toBeCloseTo(5000 * 12 / 1_000_000, 8);
    expect(cost.reasoningUsd).toBe(0);
    expect(cost.tokens.reasoning).toBe(4000);
  });
});

describe('robustness', () => {
  it('returns zeros for missing usage', () => {
    const cost = computeCallCost({
      route: 'anthropic',
      model: 'claude-opus-4-7',
      usage: undefined,
      providerMetadata: undefined,
    });
    expect(cost.totalUsd).toBe(0);
    expect(cost.source).toBe('estimated');
  });

  it('falls back to top-level fields if inputTokenDetails is missing', () => {
    const cost = computeCallCost({
      route: 'anthropic',
      model: 'claude-opus-4-7',
      usage: { inputTokens: 1_000_000, outputTokens: 0 } as never,
      providerMetadata: undefined,
    });
    expect(cost.inputUsd).toBeCloseTo(5, 6);
  });
});

describe('sumCallCosts', () => {
  it('returns the empty cost for an empty list', () => {
    expect(sumCallCosts([])).toEqual(emptyCallCost('estimated'));
  });

  it('adds all components and degrades source to estimated if any call is estimated', () => {
    const a = computeCallCost({
      route: 'gateway',
      model: 'claude-opus-4-7',
      usage: usage({ noCache: 1000, output: 1000 }),
      providerMetadata: { gateway: { cost: '0.01' } },
    });
    const b = computeCallCost({
      route: 'anthropic',
      model: 'claude-opus-4-7',
      usage: usage({ noCache: 1000, output: 1000 }),
      providerMetadata: undefined,
    });
    const total = sumCallCosts([a, b]);
    expect(total.totalUsd).toBeCloseTo(a.totalUsd + b.totalUsd, 8);
    expect(total.source).toBe('estimated');
  });

  it('keeps source gateway-exact when every call is exact', () => {
    const a = computeCallCost({
      route: 'gateway',
      model: 'claude-opus-4-7',
      usage: usage({}),
      providerMetadata: { gateway: { cost: '0.01' } },
    });
    const b = computeCallCost({
      route: 'gateway',
      model: 'claude-opus-4-7',
      usage: usage({}),
      providerMetadata: { gateway: { cost: '0.02' } },
    });
    expect(sumCallCosts([a, b]).source).toBe('gateway-exact');
  });
});
