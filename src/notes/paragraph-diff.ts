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

const wordsOf = (text: string): string[] => text.split(/\s+/).filter((word) => word.length > 0);

/**
 * The classic longest-common-subsequence table, filled from the end.
 *
 * A flat Int32Array rather than nested arrays: his longest essay is around
 * seven hundred paragraphs, and half a million boxed numbers to draw one dialog
 * is a cost with nothing to show for it.
 */
function commonLengths(from: readonly string[], to: readonly string[]): Int32Array {
  const width = to.length + 1;
  const table = new Int32Array((from.length + 1) * width);

  for (let row = from.length - 1; row >= 0; row -= 1) {
    for (let column = to.length - 1; column >= 0; column -= 1) {
      table[row * width + column] =
        from[row] === to[column]
          ? (table[(row + 1) * width + column + 1] ?? 0) + 1
          : Math.max(table[(row + 1) * width + column] ?? 0, table[row * width + column + 1] ?? 0);
    }
  }
  return table;
}

/** One alignment, used for paragraphs and then again for the words inside one. */
function align(from: readonly string[], to: readonly string[]): WordPiece[] {
  const table = commonLengths(from, to);
  const width = to.length + 1;
  const ahead = (row: number, column: number): number => table[row * width + column] ?? 0;

  const pieces: WordPiece[] = [];
  let row = 0;
  let column = 0;

  while (row < from.length && column < to.length) {
    const [here, there] = [from[row] ?? '', to[column] ?? ''];
    if (here === there) {
      pieces.push({ kind: 'same', text: here });
      row += 1;
      column += 1;
    } else if (ahead(row + 1, column) >= ahead(row, column + 1)) {
      pieces.push({ kind: 'added', text: here });
      row += 1;
    } else {
      pieces.push({ kind: 'missing', text: there });
      column += 1;
    }
  }
  for (; row < from.length; row += 1) pieces.push({ kind: 'added', text: from[row] ?? '' });
  for (; column < to.length; column += 1) pieces.push({ kind: 'missing', text: to[column] ?? '' });

  return pieces;
}

/** Null unless these two are alike enough to be called one paragraph reworded. */
function reworded(was: string, now: string): DiffPiece | null {
  const [before, after] = [wordsOf(was), wordsOf(now)];
  const longer = Math.max(before.length, after.length);
  if (longer < ENOUGH_WORDS) return null;

  const words = align(before, after);
  const shared = words.filter((word) => word.kind === 'same').length;

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
