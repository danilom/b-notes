/**
 * What one save did to his text.
 *
 * Measured at the ends rather than word by word: how much of the start and the
 * finish both texts still share, and therefore how much in the middle went and
 * how much arrived. That is enough to tell an edit from a disaster, and it does
 * not need a diff — which matters when this runs on a 145,000 character essay
 * every time he stops typing for eight hundred milliseconds.
 */
export interface TextChange {
  removed: number;
  added: number;
}

/**
 * Enough of his writing to be worth keeping a copy of.
 *
 * About thirty-three words: under his median paragraph, so losing a whole
 * ordinary paragraph in one go is covered, while a phrase or a sentence is not.
 * Five hundred was tried first and was too much — it is forty per cent of his
 * median text, and a third of his archive is shorter than that altogether, so
 * nothing they lost could ever have counted.
 */
export const WORTH_KEEPING = 200;

function sharedStart(from: string, to: string): number {
  const most = Math.min(from.length, to.length);
  let at = 0;
  while (at < most && from[at] === to[at]) at += 1;
  return at;
}

function sharedEnd(from: string, to: string, alreadyShared: number): number {
  const most = Math.min(from.length, to.length) - alreadyShared;
  let at = 0;
  while (at < most && from[from.length - 1 - at] === to[to.length - 1 - at]) at += 1;
  return at;
}

/** How much went and how much arrived between one text and the next. */
export function changeBetween(from: string, to: string): TextChange {
  const start = sharedStart(from, to);
  const end = sharedEnd(from, to, start);
  return { removed: from.length - start - end, added: to.length - start - end };
}

/**
 * Whether this save is about to destroy enough to keep a copy of first.
 *
 * Two questions, one number. Is enough going? And is there enough in what is
 * going that the copy we already have does not hold?
 *
 * The second is what stops a long cutting session leaving six near-identical
 * copies. While he is only cutting, the copy taken when he started already has
 * everything, so there is nothing to add — but the moment he writes something
 * new, that copy is missing it, and the next cut keeps one again. A clock was
 * tried for this first and got it wrong: five minutes of writing followed by a
 * deletion would have fallen inside the window and been kept nowhere.
 *
 * So the most he can lose to this is under two hundred characters of new
 * writing, which is the amount the first question has already decided is not
 * worth keeping.
 */
export function worthKeeping(previous: string, next: string, lastKept: string | null): boolean {
  if (changeBetween(previous, next).removed < WORTH_KEEPING) return false;
  if (lastKept === null) return true;
  return changeBetween(lastKept, previous).added >= WORTH_KEEPING;
}
