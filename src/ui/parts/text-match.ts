import { toSearchable } from '../../language/diacritics.ts';
import { type Language, strings } from '../../language/wording.ts';

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
 * Matched the same way the list matches — same case folding, same diacritics —
 * so what is marked in his writing and what was found in the list can never
 * disagree. The folding is one character for one, so these offsets are offsets
 * into the text he can see.
 *
 * @returns matches in the order they appear, never overlapping.
 */
export function matchesIn(text: string, query: string): TextMatch[] {
  const needle = toSearchable(query.trim());
  if (needle.length === 0) return [];

  // Folded here rather than taken from the note: what he is looking at may have
  // words in it he hasn't finished typing, let alone saved.
  const haystack = toSearchable(text);
  const found: TextMatch[] = [];
  let at = haystack.indexOf(needle);

  while (at !== -1 && found.length < MOST_MARKS) {
    found.push({ start: at, end: at + needle.length });
    // Past the whole match, so "aa" in "aaaa" is two matches and not three.
    at = haystack.indexOf(needle, at + needle.length);
  }
  return found;
}

/** The little panel over his writing that counts what a search found. */
export interface FoundPanel {
  shown: boolean;
  label: string;
  /**
   * Whether there is anywhere to step, in each direction separately.
   *
   * It used to wrap, on the grounds that a button which does nothing is how he
   * concludes the app has stopped working. But a list that silently starts over
   * is the same problem one step later: he presses on, lands back at the top,
   * and cannot tell whether he has seen everything or lost his place. A button
   * greyed out says where the end is before he presses it.
   */
  canGoBack: boolean;
  canGoOn: boolean;
}

/**
 * What the panel says about a search, and whether it is there at all.
 *
 * A single match says so in words rather than counting to one: "1 od 1" is a
 * sum, and what he wants to know is that there is no more looking to do. The
 * arrows go quiet with it, because a button that does nothing when pressed is
 * how he concludes the app has stopped working.
 */
export function foundPanelFor(
  found: readonly TextMatch[],
  at: number,
  language: Language,
): FoundPanel {
  const words = strings(language);

  if (found.length === 0) return { shown: false, label: '', canGoBack: false, canGoOn: false };
  if (found.length === 1) {
    return { shown: true, label: words.foundOnce, canGoBack: false, canGoOn: false };
  }
  return {
    shown: true,
    label: words.foundAt(at + 1, found.length),
    canGoBack: at > 0,
    canGoOn: at < found.length - 1,
  };
}
