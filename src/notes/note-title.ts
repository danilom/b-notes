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
