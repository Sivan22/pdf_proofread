import type { LanguageModelUsage, ProviderMetadata } from 'ai';
import type { Model, Route } from '../store/settings';

/** Per-million-token rates in USD. Snapshot — see PRICING_VERSION. */
interface ModelRates {
  input: number;
  cachedRead: number;
  /** 5-minute cache write (Anthropic). 0 for providers that don't bill writes separately. */
  cacheWrite: number;
  output: number;
  /** If set, requests with input above the threshold use these alternate rates instead. */
  longContext?: { thresholdInputTokens: number; input: number; output: number };
}

/**
 * Snapshot of public list prices (USD per million tokens) as of the PRICING_VERSION date.
 * Exact totals come from the gateway when used; these rates only apply to direct routes
 * or as a fallback when the gateway omits a cost field.
 */
export const PRICING: Record<Model, ModelRates> = {
  'claude-opus-4-7': {
    input: 5,
    cachedRead: 0.5,
    cacheWrite: 6.25,
    output: 25,
  },
  'gemini-3.1-pro': {
    input: 2,
    cachedRead: 0.5,
    cacheWrite: 0,
    output: 12,
    longContext: { thresholdInputTokens: 200_000, input: 4, output: 18 },
  },
};

export const PRICING_VERSION = '2026-05';

export type CostSource = 'gateway-exact' | 'estimated';

export interface CallCost {
  inputUsd: number;
  cachedReadUsd: number;
  cacheWriteUsd: number;
  outputUsd: number;
  /** Always 0 today: reasoning tokens are already included in outputTokens. Kept for visibility. */
  reasoningUsd: number;
  totalUsd: number;
  source: CostSource;
  tokens: {
    input: number;
    cachedRead: number;
    cacheWrite: number;
    output: number;
    reasoning: number;
  };
}

export function emptyCallCost(source: CostSource = 'estimated'): CallCost {
  return {
    inputUsd: 0,
    cachedReadUsd: 0,
    cacheWriteUsd: 0,
    outputUsd: 0,
    reasoningUsd: 0,
    totalUsd: 0,
    source,
    tokens: { input: 0, cachedRead: 0, cacheWrite: 0, output: 0, reasoning: 0 },
  };
}

export interface ComputeCostArgs {
  route: Route;
  model: Model;
  usage: LanguageModelUsage | undefined;
  providerMetadata: ProviderMetadata | undefined;
}

export function computeCallCost(args: ComputeCostArgs): CallCost {
  const { route, model, usage, providerMetadata } = args;
  const tokens = readTokens(usage);

  // Gateway returns the exact USD debited in providerMetadata.gateway.cost.
  // Use it when present; otherwise estimate.
  if (route === 'gateway') {
    const exact = readGatewayCost(providerMetadata);
    if (exact !== null) {
      return {
        ...estimate(model, tokens),
        totalUsd: exact,
        source: 'gateway-exact',
      };
    }
  }

  return estimate(model, tokens);
}

export function sumCallCosts(costs: CallCost[]): CallCost {
  if (costs.length === 0) return emptyCallCost('estimated');
  const out = emptyCallCost(costs[0].source);
  for (const c of costs) {
    out.inputUsd += c.inputUsd;
    out.cachedReadUsd += c.cachedReadUsd;
    out.cacheWriteUsd += c.cacheWriteUsd;
    out.outputUsd += c.outputUsd;
    out.reasoningUsd += c.reasoningUsd;
    out.totalUsd += c.totalUsd;
    out.tokens.input += c.tokens.input;
    out.tokens.cachedRead += c.tokens.cachedRead;
    out.tokens.cacheWrite += c.tokens.cacheWrite;
    out.tokens.output += c.tokens.output;
    out.tokens.reasoning += c.tokens.reasoning;
    if (c.source === 'estimated') out.source = 'estimated';
  }
  return out;
}

function readTokens(usage: LanguageModelUsage | undefined): CallCost['tokens'] {
  if (!usage) return { input: 0, cachedRead: 0, cacheWrite: 0, output: 0, reasoning: 0 };
  const details = usage.inputTokenDetails;
  const input =
    details?.noCacheTokens ?? usage.inputTokens ?? 0;
  const cachedRead = details?.cacheReadTokens ?? 0;
  const cacheWrite = details?.cacheWriteTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const reasoning = usage.outputTokenDetails?.reasoningTokens ?? 0;
  return { input, cachedRead, cacheWrite, output, reasoning };
}

function estimate(model: Model, tokens: CallCost['tokens']): CallCost {
  const rates = PRICING[model];
  const inputTotal = tokens.input + tokens.cachedRead + tokens.cacheWrite;
  const useLong =
    !!rates.longContext && inputTotal > rates.longContext.thresholdInputTokens;
  const inputRate = useLong ? rates.longContext!.input : rates.input;
  const outputRate = useLong ? rates.longContext!.output : rates.output;

  const inputUsd = (tokens.input * inputRate) / 1_000_000;
  const cachedReadUsd = (tokens.cachedRead * rates.cachedRead) / 1_000_000;
  const cacheWriteUsd = (tokens.cacheWrite * rates.cacheWrite) / 1_000_000;
  const outputUsd = (tokens.output * outputRate) / 1_000_000;
  const totalUsd = inputUsd + cachedReadUsd + cacheWriteUsd + outputUsd;
  return {
    inputUsd,
    cachedReadUsd,
    cacheWriteUsd,
    outputUsd,
    reasoningUsd: 0,
    totalUsd,
    source: 'estimated',
    tokens,
  };
}

function readGatewayCost(meta: ProviderMetadata | undefined): number | null {
  const gateway = meta?.gateway as Record<string, unknown> | undefined;
  if (!gateway) return null;
  const raw = gateway.cost;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
