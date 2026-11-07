import { diffTexts } from '../../notes/text-diff.ts';
import { isSameText } from './lektor-kept-results.ts';

/*
  Whether a text has changed by so little that the comment on it still stands, so that he comes back
  to that rather than to a button that would spend a try, one of twenty a day on the free Lektor and
  real money on the paid one.
*/

/** A number of words rather than a share: a share of a long essay would let a whole paragraph pass as tiny. */
const MOST_WORDS_IN_SMALL_EDIT = 10;

const WORD = /[\p{L}\p{M}\p{N}]+/gu;

const wordsIn = (text: string): number => text.match(WORD)?.length ?? 0;

/** By the diff the review uses, so that a moved paragraph counts and one word replaced by another counts once. */
export function wordsChanged(before: string, after: string): number {
  return diffTexts(before, after).reduce((sum, piece) => (piece.kind === 'same' ? sum : sum + Math.max(wordsIn(piece.removed), wordsIn(piece.added))), 0);
}

/** A changed comma counts as an edit too, though no word changed. An identical text is not an edit at all. */
export const isSmallEdit = (before: string, after: string): boolean => !isSameText(before, after) && wordsChanged(before, after) <= MOST_WORDS_IN_SMALL_EDIT;
