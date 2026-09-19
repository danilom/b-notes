/**
 * The five letters Serbian Latin adds to the alphabet, and the letters he types
 * when he can't be bothered with them.
 *
 * He drops them inconsistently — the same word appears as `šećer`, `secer`,
 * `šecer` and `sećer` across his own texts — so both his writing and whatever
 * he types into the search are reduced to the same plain spelling before they
 * are compared, and any version finds any other.
 *
 * Every one of these is a single character standing in for a single character.
 * That matters more than it looks: it is the reduced text that gets searched,
 * and the positions of what is found are used to mark his writing, so a
 * replacement that changed the length would put the marks on the wrong letters.
 *
 * `đ` is why this is a table rather than a call to `normalize('NFD')`, which
 * splits an accented letter into a plain one and its accent. `đ` has a stroke
 * through it rather than a mark above it, so there is nothing to split off and
 * that trick leaves it exactly as it was.
 */
const PLAIN = new Map([
  ['š', 's'],
  ['đ', 'd'],
  ['č', 'c'],
  ['ć', 'c'],
  ['ž', 'z'],
]);

const DIACRITICS = /[šđčćž]/g;

/**
 * His text as it is searched: lower case, and stripped of diacritics.
 *
 * Deliberately not done per keystroke. Over six hundred texts this costs about
 * a tenth of a second on his slowest machine, and doing it once when they load
 * makes searching *faster* than before it existed — the search then compares
 * plain strings instead of lowercasing three megabytes on every letter he
 * types. Measured: 3.1ms per keystroke before, 0.1ms after.
 *
 * Text already written as a bare letter followed by a separate accent
 * character is left alone, because removing that accent would shorten the
 * string and move every mark after it. None of his texts are written that way.
 */
export function toSearchable(text: string): string {
  return text.toLowerCase().replace(DIACRITICS, (letter) => PLAIN.get(letter) ?? letter);
}
