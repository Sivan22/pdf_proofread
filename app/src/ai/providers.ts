import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGateway, type LanguageModel } from 'ai';
import type { Model, Route, Settings } from '../store/settings';

const DIRECT_MODEL_ID: Record<Route, Partial<Record<Model, string>>> = {
  anthropic: { 'claude-opus-4-7': 'claude-opus-4-7' },
  google:    { 'gemini-3.1-pro': 'gemini-3.1-pro-preview' },
  gateway:   {
    'claude-opus-4-7': 'anthropic/claude-opus-4-7',
    'gemini-3.1-pro':  'google/gemini-3.1-pro-preview',
  },
};

export function isRouteModelValid(route: Route, model: Model): boolean {
  return DIRECT_MODEL_ID[route]?.[model] !== undefined;
}

export function resolveModelId(route: Route, model: Model): string {
  const id = DIRECT_MODEL_ID[route]?.[model];
  if (!id) {
    throw new Error(`Model "${model}" is not available on route "${route}".`);
  }
  return id;
}

export function createModel(settings: Settings): LanguageModel {
  const id = resolveModelId(settings.route, settings.model);
  switch (settings.route) {
    case 'anthropic': {
      const key = settings.apiKeys.anthropic;
      if (!key) throw new Error('Anthropic API key is required.');
      const provider = createAnthropic({
        apiKey: key,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      });
      return provider(id);
    }
    case 'google': {
      const key = settings.apiKeys.google;
      if (!key) throw new Error('Google API key is required.');
      const provider = createGoogleGenerativeAI({ apiKey: key });
      return provider(id);
    }
    case 'gateway': {
      const key = settings.apiKeys.gateway;
      if (!key) throw new Error('Gateway API key is required.');
      const provider = createGateway({ apiKey: key });
      return provider(id);
    }
  }
}
