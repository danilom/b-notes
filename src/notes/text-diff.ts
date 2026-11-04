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

type Change = Extract<TextPiece, { kind: 'change' }>;

const sizeOf = ({ removed, added }: Change): number => Math.max(removed.length, added.length);

/**
 * Whether what stands between two changes is too little to be worth reading
 * apart from them.
 *
 * Measured against the changes rather than by a fixed size: `je` between two
 * rewritten clauses matched by accident, while the same `je` between two
 * one-letter corrections is most of what is there to read.
 *
 * Never across a line break. His lines and paragraphs are his, and a change that
 * spanned one could not be read as old sentence, then new sentence.
 */
const isAbsorbed = (between: string, left: Change, right: Change): boolean =>
  !between.includes('\n') && between.length <= sizeOf(left) && between.length <= sizeOf(right);

/**
 * Joins changes that sit close together into one, so a rewritten sentence reads
 * as the old one and then the new one, not as a scatter of single words around
 * the little words that happened to match.
 *
 * What it absorbs goes into both sides of the change, so the pieces still join
 * back into exactly either text. It does mean a joined change is one thing to
 * take or leave.
 */
export function mergeCloseChanges(pieces: readonly TextPiece[]): TextPiece[] {
  const merged: TextPiece[] = [];

  for (const piece of pieces) {
    merged.push(piece);

    // Each join makes a bigger change, which may now be able to absorb what is
    // on its other side, so this goes on looking back until nothing more gives.
    for (;;) {
      const [left, between, right] = merged.slice(-3);
      if (left?.kind !== 'change' || between?.kind !== 'same' || right?.kind !== 'change') break;
      if (!isAbsorbed(between.text, left, right)) break;

      merged.splice(-3, 3, {
        kind: 'change',
        removed: left.removed + between.text + right.removed,
        added: left.added + between.text + right.added,
      });
    }
  }
  return merged;
}
