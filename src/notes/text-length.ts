/**
 * How long one of his texts is, against the others.
 *
 * Four bands and an empty one, worked out from his own corpus rather than from
 * a notion of what a long text is. His median runs to about twelve hundred
 * words and a third of what he has is under five hundred — numbers that
 * describe him, not writing in general, and a threshold picked by anyone else
 * would be describing a different man.
 *
 * Measured in bytes, which are already known for every file and need no
 * reading. Diacritics cost two bytes each in UTF-8, so a text heavy in č and ž
 * counts slightly longer than one that is not — which matters to nobody at the
 * width of a band.
 */

/** Nothing on the page. He empties texts rather than deleting them: `note.ts` counts 8 sitting in his list. */
export const EMPTY_UNDER_BYTES = 10;

/**
 * Where a band cannot begin, however short everything is.
 *
 * A guard rail, not a scale. For his corpus these never come into it — the
 * quartiles sit far above them — but a fresh install with four jottings in it
 * would otherwise declare one of them long, and a corpus of one has no
 * quartiles at all. Anybody tuning these is tuning the wrong thing.
 */
const FLOORS = [100, 200, 300] as const;

/** The three sizes at which one band becomes the next. */
export interface LengthBands {
  readonly at: readonly [number, number, number];
}

/** How full the page is drawn: nothing, or one to four lines. */
export type LengthBand = 0 | 1 | 2 | 3 | 4;

/**
 * The quartiles of what he has written, held off the floor.
 *
 * Quartiles fill all four bands whether or not the spread deserves it, which
 * is a property of the method rather than of his writing — his spread is real.
 * Nothing holds the top down, and that is deliberate: a full page beside a note
 * says something false about it, while a single line beside a long essay only
 * says it is the shortest of a long set, which is true.
 */
export function bandsFrom(sizes: readonly number[]): LengthBands {
  const sorted = [...sizes].sort((a, b) => a - b);
  const at = FLOORS.map((floor, index) =>
    Math.max(floor, quartile(sorted, (index + 1) / 4)),
  ) as unknown as [number, number, number];
  return { at };
}

/**
 * The value a given way along the sorted sizes, or zero when there are none.
 *
 * No guard for the empty corpus: the index comes out at -1, nothing is there,
 * and the fallback answers. A guard was written for it and taken out again —
 * removing it failed to break a single test, which is what a line that cannot
 * be reached looks like.
 */
function quartile(sorted: readonly number[], through: number): number {
  const at = Math.min(sorted.length - 1, Math.floor(sorted.length * through));
  return sorted[at] ?? 0;
}

/**
 * How many bytes a text would take on disk.
 *
 * For the three lists that hold writing without holding its file: the deleted,
 * the archive, and the copies kept of one text. Those arrive as strings, and
 * the bands they are measured against were worked out from file sizes, so the
 * measure has to be the same one — a length in characters would put every text
 * with diacritics in it a band too low.
 */
export function bytesOf(text: string): number {
  return ENCODER.encode(text).length;
}

/** One for the app, rather than one per row on a list six hundred long. */
const ENCODER = new TextEncoder();

/** Which band a text falls in. */
export function bandOf(bytes: number, bands: LengthBands): LengthBand {
  if (bytes < EMPTY_UNDER_BYTES) return 0;
  if (bytes < bands.at[0]) return 1;
  if (bytes < bands.at[1]) return 2;
  if (bytes < bands.at[2]) return 3;
  return 4;
}
