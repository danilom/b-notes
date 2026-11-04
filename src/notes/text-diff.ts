import { alignSequences } from './sequence-alignment.ts';

/**
 * Two texts as one list, in reading order: what they share, and what stands in
 * one where the other has something else.
 *
 * Nothing is left out or tidied. The `same` and `removed` parts joined are the
 * first text exactly, and the `same` and `added` parts the second, spaces and
 * all. So taking one change and not another is only a matter of which side of
 * it to join, and nothing here has to know that is ever done.
 */
export type TextPiece =
  | { kind: 'same'; text: string }
  | { kind: 'change'; removed: string; added: string };

/**
 * A word, a run of spaces and breaks, or one mark of punctuation.
 *
 * Punctuation stands alone because a proofreader's comma is the edit, and the
 * word beside it did not change. Letters are taken by Unicode class so that
 * `š` does not split a word, and combining marks count, because a text pasted
 * from elsewhere can spell `č` as `c` and a mark.
 */
const TOKEN = /\s+|[\p{L}\p{M}\p{N}]+|[^\s\p{L}\p{M}\p{N}]/gu;

const tokensOf = (text: string): string[] => text.match(TOKEN) ?? [];

/**
 * @param before The text as it stands.
 * @param after The text it would become.
 */
export function diffTexts(before: string, after: string): TextPiece[] {
  const pieces: TextPiece[] = [];

  for (const { kind, text } of alignSequences(tokensOf(before), tokensOf(after))) {
    const open = pieces.at(-1);
    if (kind === 'same') {
      if (open?.kind === 'same') open.text += text;
      else pieces.push({ kind: 'same', text });
      continue;
    }
    const change = open?.kind === 'change' ? open : { kind: 'change' as const, removed: '', added: '' };
    if (change !== open) pieces.push(change);
    if (kind === 'onlyFrom') change.removed += text;
    else change.added += text;
  }
  return pieces;
}
