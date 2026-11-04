/**
 * What one earlier copy of a text and the active text each hold that the other
 * does not, in reading order.
 *
 * Paragraphs, not words: he writes in them, and a word-level diff of two
 * thousand words is a thing to decipher rather than read. But a paragraph he
 * changed one sentence of arrives at that grain as a paragraph replaced —
 * twice the writing on screen, two thirds of it identical, to report a handful
 * of words. So where one paragraph clearly became another, and only there, the
 * two are shown as one and compared word by word.
 *
 * Words and not characters, and that is about Serbian rather than about taste:
 * the language is inflected, so `zimi` becoming `zime` is one word changed. At
 * character level it marks a letter inside a word, which reads as a typo.
 */
export type DiffKind = 'same' | 'added' | 'missing' | 'changed';

/** One word, and which side of the comparison it is on. */
export interface WordPiece {
  kind: 'same' | 'added' | 'missing';
  text: string;
}

/**
 * One paragraph and which of the two texts has it.
 *
 * `added` is in the copy and not in the active text — what bringing the copy
 * back would give him. `missing` is the other way about, and is what bringing
 * it back would cost. `changed` is one paragraph that is in both and is not the
 * same in both, carrying the words that differ; its `text` is the copy's
 * wording, so it reads like `added` to anything that only wants the gist.
 */
export type DiffPiece =
  | { kind: 'same' | 'added' | 'missing'; text: string }
  | { kind: 'changed'; text: string; words: readonly WordPiece[] };

export interface ParagraphDiff {
  pieces: DiffPiece[];
  /**
   * True when the two share no paragraph at all.
   *
   * It happens to a text he rewrote outright, and to the one in nine of his
   * that is a single unbroken block. Marking every paragraph on the page says
   * nothing the page did not, so nothing is marked and this is said instead.
   */
  unrelated: boolean;
}

/**
 * How alike two paragraphs have to be before they are called one paragraph
 * changed rather than two paragraphs swapped.
 *
 * Below this the word comparison stops informing and starts making confetti:
 * `i`, `je`, `na` and `su` match across sentences that have nothing to do with
 * each other, and the marks land everywhere and mean nothing.
 */
const SAME_ENOUGH = 0.5;

/**
 * And long enough for that fraction to mean anything.
 *
 * Two paragraphs of two words each share half of themselves the moment one
 * word matches, so on short ones the ratio says nothing. His paragraphs run to
 * about thirty-three words; below eight there is not enough there for
 * "reworded" to be a better account than "replaced".
 */
const ENOUGH_WORDS = 8;

const paragraphsOf = (text: string): string[] =>
  text
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

/**
 * A line break inside a paragraph, standing among its words.
 *
 * His lines inside a paragraph are his: three changes written one under the
 * other are three lines, and a paragraph compared word by word used to come
 * back as one run-on line because every break was split away with the spaces.
 */
export const LINE_BREAK = '\n';

/** A paragraph's words, each line break kept as a word of its own. */
const wordsOf = (text: string): string[] =>
  text.split(/[ \t]+|(\n)/).filter((word): word is string => word !== undefined && word.length > 0);

/** How many words, not counting line breaks, which say nothing about how alike two paragraphs are. */
const countOf = (words: readonly string[]): number => words.filter((word) => word !== LINE_BREAK).length;

/**
 * How many insertions and deletions an alignment will look for before calling
 * the two sides simply replaced.
 *
 * The search keeps about edits²/2 numbers, so this is what bounds it: some 32 MB
 * at the limit, on a laptop with 4 GB. Two sides further apart than this have
 * thousands of words between them that differ, where a closer alignment would
 * not say anything he could read anyway.
 */
const MOST_EDITS = 4000;

/** How far along `from` a path gets by taking one more of its items, or -1 where none leads here. */
const reachedAcross = (before: Int32Array, slot: number): number =>
  slot > 0 ? (before[slot - 1] ?? 0) + 1 : -1;

/** How far along `from` a path stands after taking one more of `to`, or -1 where none leads here. */
const reachedDown = (before: Int32Array, slot: number, edits: number): number =>
  slot < edits ? (before[slot] ?? 0) : -1;

/**
 * Myers' greedy search: for each number of edits in turn, how far along `from`
 * each diagonal can get. Done when one reaches the end of both.
 *
 * Its cost follows how much the two differ rather than how long they are, and
 * that is why it is here. The table it replaced cost words × words whatever the
 * edit, so a proofreader's few changes to a long paragraph took seventeen
 * seconds at 30,000 words and ran out of memory at 60,000.
 *
 * Nothing stops a path running off the end of a side, and nothing needs to: it
 * can never come back, and getting that far costs more edits than the real end
 * does, so the real end is always found first.
 *
 * @returns One row per number of edits, for walking back; null past MOST_EDITS.
 */
function furthestReached(from: readonly string[], to: readonly string[]): Int32Array[] | null {
  const trace: Int32Array[] = [];
  const most = Math.min(from.length + to.length, MOST_EDITS);

  for (let edits = 0; edits <= most; edits += 1) {
    const before = trace.at(-1) ?? new Int32Array(0);
    const row = new Int32Array(edits + 1);

    for (let slot = 0; slot <= edits; slot += 1) {
      const diagonal = 2 * slot - edits;
      let x = edits === 0 ? 0 : Math.max(reachedAcross(before, slot), reachedDown(before, slot, edits));
      while (x < from.length && x - diagonal < to.length && from[x] === to[x - diagonal]) x += 1;
      row[slot] = x;
      if (x === from.length && x - diagonal === to.length) {
        trace.push(row);
        return trace;
      }
    }
    trace.push(row);
  }
  return null;
}

/**
 * Walks the search back from the end to the path it found, in reading order.
 *
 * Where either step would do, the step taken last is one of `to`, which reads
 * as what `from` had coming before what `to` has in its place.
 */
function pathThrough(trace: readonly Int32Array[], from: readonly string[], to: readonly string[]): WordPiece[] {
  const backwards: WordPiece[] = [];
  let x = from.length;
  let y = to.length;

  for (let edits = trace.length - 1; edits > 0; edits -= 1) {
    const before = trace[edits - 1] ?? new Int32Array(0);
    const slot = (x - y + edits) / 2;
    const across = reachedAcross(before, slot);
    const down = reachedDown(before, slot, edits);
    const start = Math.max(across, down);

    for (; x > start; x -= 1, y -= 1) backwards.push({ kind: 'same', text: from[x - 1] ?? '' });

    if (down >= across) {
      y -= 1;
      backwards.push({ kind: 'missing', text: to[y] ?? '' });
    } else {
      x -= 1;
      backwards.push({ kind: 'added', text: from[x] ?? '' });
    }
  }
  for (; x > 0; x -= 1) backwards.push({ kind: 'same', text: from[x - 1] ?? '' });

  return backwards.reverse();
}

/** One alignment, used for paragraphs and then again for the words inside one. */
function align(from: readonly string[], to: readonly string[]): WordPiece[] {
  const trace = furthestReached(from, to);
  if (trace !== null) return pathThrough(trace, from, to);

  return [
    ...from.map((text): WordPiece => ({ kind: 'added', text })),
    ...to.map((text): WordPiece => ({ kind: 'missing', text })),
  ];
}

/** Null unless these two are alike enough to be called one paragraph reworded. */
function reworded(was: string, now: string): DiffPiece | null {
  const [before, after] = [wordsOf(was), wordsOf(now)];
  const longer = Math.max(countOf(before), countOf(after));
  if (longer < ENOUGH_WORDS) return null;

  const words = align(before, after);
  const shared = words.filter((word) => word.kind === 'same' && word.text !== LINE_BREAK).length;

  if (shared / longer < SAME_ENOUGH) return null;
  return { kind: 'changed', text: was, words };
}

/**
 * Joins a paragraph that went to the one that replaced it, where there plainly
 * was one.
 *
 * Strictly one against one. Two paragraphs rewritten side by side come out of
 * the alignment as two of each, and which goes with which is guesswork — so
 * they stay four blocks, which says less but says nothing wrong.
 */
function joiningRewordings(pieces: readonly DiffPiece[]): DiffPiece[] {
  const joined: DiffPiece[] = [];

  for (let at = 0; at < pieces.length; at += 1) {
    const here = pieces[at];
    const next = pieces[at + 1];
    if (here === undefined) continue;

    const alone =
      pieces[at - 1]?.kind !== here.kind && next !== undefined && pieces[at + 2]?.kind !== next.kind;
    const pair =
      alone && here.kind === 'added' && next?.kind === 'missing'
        ? reworded(here.text, next.text)
        : alone && here.kind === 'missing' && next?.kind === 'added'
          ? reworded(next.text, here.text)
          : null;

    if (pair === null) {
      joined.push(here);
      continue;
    }
    joined.push(pair);
    at += 1;
  }
  return joined;
}

/**
 * @param copy The earlier version.
 * @param active The text as it stands now.
 */
export function diffParagraphs(copy: string, active: string): ParagraphDiff {
  const [was, now] = [paragraphsOf(copy), paragraphsOf(active)];
  const pieces = align(was, now);

  if (!pieces.some((piece) => piece.kind === 'same') && was.length > 0) {
    return { pieces: was.map((text): DiffPiece => ({ kind: 'same', text })), unrelated: true };
  }
  return { pieces: joiningRewordings(pieces), unrelated: false };
}

/** Consecutive paragraphs of one kind, so a run of six is labelled once. */
export interface DiffRun {
  kind: DiffKind;
  pieces: DiffPiece[];
}

export function runsOf(pieces: readonly DiffPiece[]): DiffRun[] {
  const runs: DiffRun[] = [];
  for (const piece of pieces) {
    const open = runs.at(-1);
    if (open?.kind === piece.kind) open.pieces.push(piece);
    else runs.push({ kind: piece.kind, pieces: [piece] });
  }
  return runs;
}
