/**
 * What one earlier copy of a text and the active text each hold that the other
 * does not, paragraph by paragraph and in reading order.
 *
 * Paragraphs, not words: he writes in them, and a word-level diff of two
 * thousand words is a thing to decipher rather than read. The cost is that a
 * paragraph he changed one sentence of arrives here as a paragraph replaced,
 * which is the honest report at this granularity.
 */
export type DiffKind = 'same' | 'added' | 'missing';

/**
 * One paragraph and which of the two texts has it.
 *
 * `added` is in the copy and not in the active text — what bringing the copy
 * back would give him. `missing` is the other way about, and is what bringing
 * it back would cost.
 */
export interface DiffPiece {
  kind: DiffKind;
  text: string;
}

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

const paragraphsOf = (text: string): string[] =>
  text
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

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

/**
 * @param copy The earlier version.
 * @param active The text as it stands now.
 */
export function diffParagraphs(copy: string, active: string): ParagraphDiff {
  const [was, now] = [paragraphsOf(copy), paragraphsOf(active)];
  const table = commonLengths(was, now);
  const width = now.length + 1;
  const ahead = (row: number, column: number): number => table[row * width + column] ?? 0;

  const pieces: DiffPiece[] = [];
  let shared = 0;
  let row = 0;
  let column = 0;

  while (row < was.length && column < now.length) {
    const [here, there] = [was[row] ?? '', now[column] ?? ''];
    if (here === there) {
      pieces.push({ kind: 'same', text: here });
      shared += 1;
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
  for (; row < was.length; row += 1) pieces.push({ kind: 'added', text: was[row] ?? '' });
  for (; column < now.length; column += 1) pieces.push({ kind: 'missing', text: now[column] ?? '' });

  if (shared === 0 && was.length > 0) {
    return { pieces: was.map((text): DiffPiece => ({ kind: 'same', text })), unrelated: true };
  }
  return { pieces, unrelated: false };
}

/** Consecutive paragraphs of one kind, so a run of six is labelled once. */
export interface DiffRun {
  kind: DiffKind;
  paragraphs: string[];
}

export function runsOf(pieces: readonly DiffPiece[]): DiffRun[] {
  const runs: DiffRun[] = [];
  for (const piece of pieces) {
    const open = runs.at(-1);
    if (open?.kind === piece.kind) open.paragraphs.push(piece.text);
    else runs.push({ kind: piece.kind, paragraphs: [piece.text] });
  }
  return runs;
}
