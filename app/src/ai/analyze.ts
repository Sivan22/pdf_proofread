import { generateText } from 'ai';
import type { LanguageModel } from 'ai';
import type { ProofError } from '../pdf/mupdf';

export interface RawError {
  page: number;
  text: string;
  error: string;
  fix: string;
}

export async function analyzePages(args: {
  model: LanguageModel;
  pdfBytes: Uint8Array;
  pageNums: number[];
  prompt: string;
  abortSignal?: AbortSignal;
}): Promise<Omit<ProofError, 'match'>[]> {
  const { model, pdfBytes, pageNums, prompt, abortSignal } = args;

  const result = await generateText({
    model,
    abortSignal,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'file', data: pdfBytes, mediaType: 'application/pdf' },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  const text = result.text.trim();
  if (!text || text === '[]' || text === 'אין') return [];

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  let parsed: RawError[];
  try {
    parsed = JSON.parse(match[0]) as RawError[];
  } catch {
    return [];
  }

  // Map local 1-indexed page numbers back to original PDF page numbers (1-indexed).
  const out: Omit<ProofError, 'match'>[] = [];
  for (const e of parsed) {
    const local = typeof e.page === 'number' ? e.page : 1;
    const idx = local >= 1 && local <= pageNums.length ? local - 1 : 0;
    out.push({
      page: pageNums[idx] + 1,
      text: e.text ?? '',
      error: e.error ?? '',
      fix: e.fix ?? '',
    });
  }
  return out;
}
