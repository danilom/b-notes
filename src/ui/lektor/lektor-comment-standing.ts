import { diffTexts } from '../../notes/text-diff.ts';
import { isSameText } from './lektor-kept-results.ts';

/*
  Whether the comment on screen is still about the text in front of him. A comment shown after
  the text has changed a lot looks like a glitch to him, and a note saying so every time it has
  changed a little becomes furniture he no longer reads. So: small changes say nothing, a big
  one while he is still working from the comment says how big, and a big one he comes back to
  later starts him at the step that asks for a new one.
*/

/** About a paragraph: enough to change what a reader would say. */
const MOST_WORDS_IN_SMALL_CHANGE = 50;
/** For a short text, where fifty words would be most of it. */
const SHARE_OF_WORDS_FOR_BIG_CHANGE = 0.2;
/** Long enough for a working session, short enough that coming back after lunch is later. */
export const SITTING_MS = 2 * 60 * 60 * 1000;

const WORD = /[\p{L}\p{M}\p{N}]+/gu;

const wordsIn = (text: string): number => text.match(WORD)?.length ?? 0;

/** By the diff the review uses, so that a moved paragraph counts and one word replaced by another counts once. */
export function wordsChanged(before: string, after: string): number {
  return diffTexts(before, after).reduce((sum, piece) => (piece.kind === 'same' ? sum : sum + Math.max(wordsIn(piece.removed), wordsIn(piece.added))), 0);
}

/** How many changed words make a big change, for a text this long. */
export function wordsForBigChange(text: string): number {
  return Math.max(1, Math.min(MOST_WORDS_IN_SMALL_CHANGE, Math.ceil(wordsIn(text) * SHARE_OF_WORDS_FOR_BIG_CHANGE)));
}

export type CommentStanding =
  | { kind: 'current' }
  | { kind: 'changed'; wordsChanged: number }
  | { kind: 'outdated'; wordsChanged: number };

export interface CommentSitting {
  /** The text the comment is about. */
  readText: string;
  /** The text as it is now. */
  text: string;
  /** Whether it was written while the app has been open, rather than read back from an earlier run. */
  isFromThisRun: boolean;
  /** Whether he has put corrections in since: that ends what the comment was for. */
  hasTakenCorrections: boolean;
  readAt: number;
  now: number;
}

/** A change he is still working through, or one he has come back to. */
export function standingOf({ readText, text, isFromThisRun, hasTakenCorrections, readAt, now }: CommentSitting): CommentStanding {
  // Not needed for the answer, which would come out the same: it spares comparing a long text with itself, the commonest case, on every redraw.
  if (isSameText(readText, text)) return { kind: 'current' };
  const changed = wordsChanged(readText, text);
  if (changed < wordsForBigChange(readText)) return { kind: 'current' };
  const isSameSitting = isFromThisRun && !hasTakenCorrections && now - readAt < SITTING_MS;
  return { kind: isSameSitting ? 'changed' : 'outdated', wordsChanged: changed };
}
