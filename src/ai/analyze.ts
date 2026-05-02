import { generateText } from 'ai';
import type { LanguageModel, UserContent } from 'ai';
import type { Model, Route } from '../store/settings';
import type { ProofError } from '../pdf/mupdf';
import { computeCallCost } from './pricing';
import type { CallCost } from './pricing';

type JSONValue = string | number | boolean | null | { [k: string]: JSONValue } | JSONValue[];
type ProviderOptions = Record<string, { [k: string]: JSONValue }>;

export interface RawError {
  page: number;
  text: string;
  error: string;
  fix: string;
}

export interface AnalyzePage {
  /** 1-indexed page number within the batch (used to label pages in the prompt). */
  localPageNum: number;
  imagePng: Uint8Array;
  /** Block-formatted extracted text. May be empty when text extraction failed. */
  text: string;
}

const MAX_OUTPUT_TOKENS = 32768;

function highThinkingOptions(model: Model): ProviderOptions {
  switch (model) {
    case 'claude-opus-4-7':
      return {
        anthropic: {
          thinking: { type: 'adaptive' },
          effort: 'high',
        },
      };
    case 'gemini-3.1-pro':
      return {
        google: {
          thinkingConfig: { thinkingLevel: 'high', includeThoughts: false },
        },
      };
  }
}

export interface AnalyzeResult {
  errors: Omit<ProofError, 'match'>[];
  cost: CallCost;
}

export async function analyzePages(args: {
  model: LanguageModel;
  modelName: Model;
  route: Route;
  pages: AnalyzePage[];
  pageNums: number[];
  prompt: string;
  abortSignal?: AbortSignal;
}): Promise<AnalyzeResult> {
  const { model, modelName, route, pages, pageNums, prompt, abortSignal } = args;

  const content: UserContent = [{ type: 'text', text: prompt }];
  for (const page of pages) {
    content.push({ type: 'text', text: `\n=== עמוד ${page.localPageNum} ===\n` });
    content.push({ type: 'image', image: page.imagePng, mediaType: 'image/png' });
    if (page.text.trim()) {
      content.push({
        type: 'text',
        text: `טקסט מחולץ של עמוד ${page.localPageNum} (לציטוט מדויק; אם לא מופיע כאן, ציטוט מהתמונה):\n${page.text}`,
      });
    } else {
      content.push({
        type: 'text',
        text: `טקסט מחולץ של עמוד ${page.localPageNum}: (לא ניתן לחלץ — הסתמך על התמונה)`,
      });
    }
  }

  const result = await generateText({
    model,
    abortSignal,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    providerOptions: highThinkingOptions(modelName),
    messages: [{ role: 'user', content }],
  });

  const cost = computeCallCost({
    route,
    model: modelName,
    usage: result.usage,
    providerMetadata: result.providerMetadata,
  });

  const text = result.text.trim();
  if (!text || text === '[]' || text === 'אין') return { errors: [], cost };

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return { errors: [], cost };

  let parsed: RawError[];
  try {
    parsed = JSON.parse(match[0]) as RawError[];
  } catch {
    return { errors: [], cost };
  }

  const errors: Omit<ProofError, 'match'>[] = [];
  for (const e of parsed) {
    const local = typeof e.page === 'number' ? e.page : 1;
    const idx = local >= 1 && local <= pageNums.length ? local - 1 : 0;
    errors.push({
      page: pageNums[idx] + 1,
      text: e.text ?? '',
      error: e.error ?? '',
      fix: e.fix ?? '',
    });
  }
  return { errors, cost };
}
