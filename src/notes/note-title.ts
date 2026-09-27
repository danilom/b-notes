/**
 * Where his writing starts, as against where his text starts.
 *
 * The first line is the title — it is what the list shows and what a new text
 * is named after — so it is the one place a caret should not be dropped by the
 * app. Put one there and a single absent-minded keystroke retitles the text,
 * which reads from outside as the text having gone.
 *
 * Just past the first line ending, or the very start when there is no second
 * line: one text in nine of his is a single unbroken block, and in those there
 * is nowhere that is not the title.
 */
export function writingStartsAt(text: string): number {
  const ending = text.indexOf('\n');
  return ending === -1 ? 0 : ending + 1;
}

/**
 * The title exactly as he typed it: the first line with anything on it.
 *
 * Nothing cleverer, on purpose. This used to read on past a first line of four
 * characters or fewer and cut at fifty, which suited a Simplenote export where
 * the first line was often a fragment. His real titles are Resoph's, and
 * Resoph shows the first line as it is — `i`, `Ana1`, thirty leading spaces
 * and all. Kept whole, spaces included, because the spaces are how he ranks
 * a text in a list sorted by title.
 */
export function titleLineOf(text: string): string {
  return (text.split('\n').find((line) => line.trim().length > 0) ?? '').replace(/\r$/, '');
}

/**
 * The title as the list shows it: his first line without its edges, runs of
 * spaces made one. Length is the list's business, cut on screen and nowhere
 * else.
 */
export function titleFrom(text: string): string {
  return titleLineOf(text).replace(/\s+/g, ' ').trim();
}

/**
 * How high he has ranked a text by the spaces in front of its title, in steps
 * the list can show: none, then one to three.
 *
 * His widths bunch at 16 and at 24 spaces, the two places he has climbed to
 * so far, so those are where the steps are. A tab counts as the four spaces it
 * looks like.
 */
export function rankOf(titleLine: string): 0 | 1 | 2 | 3 {
  const leading = /^[ \t]*/.exec(titleLine)?.[0] ?? '';
  const width = [...leading].reduce((sum, character) => sum + (character === '\t' ? 4 : 1), 0);
  if (width >= 24) return 3;
  if (width >= 16) return 2;
  if (width >= 1) return 1;
  return 0;
}

/**
 * His title as the list draws it: the mark he files it under, its place in a
 * numbered series, and the rest.
 */
export interface TitleParts {
  /** As he typed it, spaces inside made one: `(UP)`, `A (E)`, `AA`, `zz`. */
  mark: string | null;
  /** Where it stands in a series under `(UP)`: `12`, `II 104`. */
  position: SeriesPosition | null;
  /** Everything after, spaces collapsed as in `titleFrom`. */
  name: string;
}

/** A place in one of his numbered series. */
export interface SeriesPosition {
  /** Which series, where he names one: `II`. */
  series: string | null;
  number: string;
}

/**
 * `(UP)`, sometimes starred, and the place in its series that may follow it.
 * The spaces around the number are his padding — right-aligned by hand, so
 * that an alphabetical list puts 3 above 12 above 104.
 */
const COLLECTION = /^(\*?\(UP\))\s+(?:(?:([IVX]{1,4})\s+)?(\d+)\s+)?/;
/** A kind — `(E)`, `(P)` — with the letters he floats or sinks it by. */
const KIND = /^([A-Za-z]{0,2} ?\([EP]\))(?:\s+|(?=[A-ZČĆŠĐŽ]))/;
/** Letters that only float a text up (`AA`) or sink it (`zz`, `y`). */
const LIFT = /^(A{2,4}|Z{2,4}|z{2,4}|y)(?:\s+|(?=[A-ZČĆŠĐŽ][a-zčćšđž]))/;

/**
 * Reads his marks off the front of a title, so the list can draw them as marks
 * rather than as words he wrote.
 *
 * Only the marks his titles are known to carry, spelled as he spells them:
 * anything else is part of the name, and a title with no mark is drawn as it
 * always was. Nothing is dropped but spaces — every letter he typed is still
 * on screen, and the order is still his, read off the line as typed.
 */
export function titlePartsOf(titleLine: string): TitleParts {
  const rest = titleLine.replace(/^\s+/, '');
  const unmarked: TitleParts = { mark: null, position: null, name: titleFrom(titleLine) };

  const found = COLLECTION.exec(rest) ?? KIND.exec(rest) ?? LIFT.exec(rest);
  if (found === null) return unmarked;

  const name = rest.slice(found[0].length).replace(/\s+/g, ' ').trim();
  // A mark with nothing after it is a title of its own, not a mark.
  if (name.length === 0) return unmarked;

  const mark = (found[1] ?? '').replace(/\s+/g, ' ');
  const number = found[3];
  const position = number === undefined ? null : { series: found[2] ?? null, number };
  return { mark, position, name };
}

const LETTERS = new Intl.Collator('sr-Latn');
const LETTER = /\p{L}/u;

/**
 * Puts two titles in the order Resoph lists them in, near enough.
 *
 * His marks work by where they sort, so the order is what has to match, and in
 * Resoph it is by character, ignoring case: spaces first, then `(`, `*`, `-`,
 * digits, and letters last. A language's collation puts punctuation in an
 * order of its own and would move his marks about. So characters are compared
 * as they are, and only where the two titles part on a letter does Serbian
 * alphabetical order take over — `č` after `c`, where by character it would
 * come after `z`.
 */
export function compareTitles(first: string, second: string): number {
  const a = first.toLowerCase();
  const b = second.toLowerCase();
  const shorter = Math.min(a.length, b.length);
  for (let at = 0; at < shorter; at += 1) {
    const x = a[at] ?? '';
    const y = b[at] ?? '';
    if (x === y) continue;
    const byLetters = LETTER.test(x) && LETTER.test(y) ? LETTERS.compare(a.slice(at), b.slice(at)) : 0;
    if (byLetters !== 0) return byLetters;
    return x < y ? -1 : 1;
  }
  return a.length - b.length;
}
