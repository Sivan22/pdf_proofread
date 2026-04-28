import { describe, expect, it } from 'vitest';
import { resolveModelId, isRouteModelValid } from './providers';

describe('resolveModelId', () => {
  it('maps Anthropic direct route', () => {
    expect(resolveModelId('anthropic', 'claude-opus-4-7')).toBe('claude-opus-4-7');
  });

  it('maps Google direct route to the preview suffix', () => {
    expect(resolveModelId('google', 'gemini-3.1-pro')).toBe('gemini-3.1-pro-preview');
  });

  it('prefixes Gateway-routed Anthropic', () => {
    expect(resolveModelId('gateway', 'claude-opus-4-7')).toBe('anthropic/claude-opus-4-7');
  });

  it('prefixes Gateway-routed Google', () => {
    expect(resolveModelId('gateway', 'gemini-3.1-pro')).toBe('google/gemini-3.1-pro-preview');
  });

  it('rejects an unsupported (route, model) pair', () => {
    expect(() => resolveModelId('anthropic', 'gemini-3.1-pro')).toThrow();
    expect(() => resolveModelId('google', 'claude-opus-4-7')).toThrow();
  });
});

describe('isRouteModelValid', () => {
  it('flags supported pairs', () => {
    expect(isRouteModelValid('anthropic', 'claude-opus-4-7')).toBe(true);
    expect(isRouteModelValid('google', 'gemini-3.1-pro')).toBe(true);
    expect(isRouteModelValid('gateway', 'claude-opus-4-7')).toBe(true);
    expect(isRouteModelValid('gateway', 'gemini-3.1-pro')).toBe(true);
  });

  it('flags unsupported pairs', () => {
    expect(isRouteModelValid('anthropic', 'gemini-3.1-pro')).toBe(false);
    expect(isRouteModelValid('google', 'claude-opus-4-7')).toBe(false);
  });
});
