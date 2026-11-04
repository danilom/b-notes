import { alignSequences } from './sequence-alignment.ts';

/**
 * Two texts as one list, in reading order: what they share, and what stands in
 * one where the other has something else.
 *
 * Nothing is left out or tidied. The `same` and `removed` parts joined are the
 * first text exactly, spaces and all, and the `same` and `added` parts the second,
 * but for how it stores its line endings and letters, which `same` takes from the
 * first. So taking one change and not another is only a matter of which side of
 * it to join, and what he has keeps its own line endings whichever he takes.
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
 * What a token is compared as, leaving out differences no reader could see.
 *
 * Windows and everything else end a line differently, and an AI's reply or a
 * pasted text can spell `č` as a `c` and a mark. Left in, either marks every line
 * or every such word of a text as changed, burying the changes that are real.
 */
const comparedAs = (token: string): string => token.replace(/\r\n?/g, '\n').normalize('NFC');

/**
 * @param before The text as it stands.
 * @param after The text it would become.
 */
export function diffTexts(before: string, after: string): TextPiece[] {
  const [beforeTokens, afterTokens] = [tokensOf(before), tokensOf(after)];
  const pieces: TextPiece[] = [];
  let [beforeAt, afterAt] = [0, 0];

  for (const { kind } of alignSequences(beforeTokens.map(comparedAs), afterTokens.map(comparedAs))) {
    const open = pieces.at(-1);
    if (kind === 'same') {
      const text = beforeTokens[beforeAt] ?? '';
      beforeAt += 1;
      afterAt += 1;
      if (open?.kind === 'same') open.text += text;
      else pieces.push({ kind: 'same', text });
      continue;
    }
    const change = open?.kind === 'change' ? open : { kind: 'change' as const, removed: '', added: '' };
    if (change !== open) pieces.push(change);
    if (kind === 'onlyFrom') {
      change.removed += beforeTokens[beforeAt] ?? '';
      beforeAt += 1;
    } else {
      change.added += afterTokens[afterAt] ?? '';
      afterAt += 1;
    }
  }
  return pieces;
}

/** A run of text in one paragraph as drawn, and whose it is. */
export interface DiffPart {
  kind: 'same' | 'removed' | 'added';
  text: string;
  /** The first part of a change, where a change is carried across paragraphs. */
  opensChange: boolean;
}

export interface DiffParagraph {
  parts: DiffPart[];
  /** Whether anything in it differs, or the break that opens it does. */
  changed: boolean;
}

const BLANK_LINES = /\r?\n[ \t]*\r?\n(?:[ \t]*\r?\n)*/;

/**
 * The pieces laid out as paragraphs, for drawing: which ones get a mark in the
 * margin, and what is in each.
 *
 * For the screen only. Unlike the pieces, this does not keep his exact spacing:
 * a blank line becomes the gap between two paragraphs.
 *
 * A change that is nothing but spacing is not split, because it has no text to
 * show on either side of the break: it stays a part, for the view to make
 * visible. An added one does still break the paragraph, and the text after it
 * counts as changed, since it now starts a paragraph it did not start before.
 */
export function paragraphsOf(pieces: readonly TextPiece[]): DiffParagraph[] {
  const paragraphs: DiffParagraph[] = [{ parts: [], changed: false }];
  const startParagraph = (changed: boolean): void => {
    paragraphs.push({ parts: [], changed });
  };

  const addPart = (part: DiffPart): void => {
    const open = paragraphs.at(-1);
    if (open === undefined) return;
    open.parts.push(part);
    open.changed ||= part.kind !== 'same';
  };

  const addSplit = (kind: DiffPart['kind'], text: string, opensChange: boolean): void => {
    let opening = opensChange;
    text.split(BLANK_LINES).forEach((chunk, at) => {
      if (at > 0) startParagraph(false);
      if (chunk.length === 0) return;
      addPart({ kind, text: chunk, opensChange: opening });
      opening = false;
    });
  };

  for (const piece of pieces) {
    if (piece.kind === 'same') {
      addSplit('same', piece.text, false);
      continue;
    }
    const { removed, added } = piece;
    if (removed.length > 0) {
      if (/\S/.test(removed)) addSplit('removed', removed, true);
      else addPart({ kind: 'removed', text: removed, opensChange: true });
    }
    if (added.length > 0) {
      const opensChange = removed.length === 0;
      if (/\S/.test(added)) {
        addSplit('added', added, opensChange);
      } else {
        addPart({ kind: 'added', text: added, opensChange });
        if (BLANK_LINES.test(added)) startParagraph(true);
      }
    }
  }
  return paragraphs.filter((paragraph) => paragraph.parts.length > 0);
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
 * Never across a line break, whether it stands between the two or is part of one
 * of them. His lines and paragraphs are his, and a change that spanned one could
 * not be read as old sentence, then new sentence.
 */
const holdsBreak = ({ removed, added }: Change): boolean => removed.includes('\n') || added.includes('\n');

const isAbsorbed = (between: string, left: Change, right: Change): boolean =>
  !between.includes('\n') &&
  !holdsBreak(left) &&
  !holdsBreak(right) &&
  between.length <= sizeOf(left) &&
  between.length <= sizeOf(right);

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
