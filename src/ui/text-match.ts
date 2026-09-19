/** Where in his text a search found something. */
export interface TextMatch {
  readonly start: number;
  readonly end: number;
}

/**
 * How many matches are worth marking in one text.
 *
 * A one-letter search against a 145KB essay finds tens of thousands, and every
 * one of them becomes an element in the layer behind his writing. Past a point
 * they stop being useful anyway — a page painted entirely yellow tells him
 * nothing — so the marking stops and the text simply reads normally below.
 */
const MOST_MARKS = 500;

/**
 * Every place the query appears in the text, ignoring case.
 *
 * Matched the same way the list matches, so what is marked in his writing and
 * what was found in the list can never disagree. Diacritics are not folded
 * here either; when they are, both will fold together.
 *
 * @returns matches in the order they appear, never overlapping.
 */
export function matchesIn(text: string, query: string): TextMatch[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];

  const haystack = text.toLowerCase();
  const found: TextMatch[] = [];
  let at = haystack.indexOf(needle);

  while (at !== -1 && found.length < MOST_MARKS) {
    found.push({ start: at, end: at + needle.length });
    // Past the whole match, so "aa" in "aaaa" is two matches and not three.
    at = haystack.indexOf(needle, at + needle.length);
  }
  return found;
}
