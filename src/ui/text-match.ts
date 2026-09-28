import { toSearchable } from '../language/diacritics.ts';
import { type Language, strings } from '../language/wording.ts';
import { hasEveryWord, phrasesIn, wordsOf } from './phrase-match.ts';

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
 * Matched the same way the list matches — same case folding, same diacritics,
 * same words — so what is marked in his writing and what was found in the list
 * can never disagree. The folding is one character for one, so these offsets
 * are offsets into the text he can see.
 *
 * Of several words, the phrase where the text has it, and nothing else: the
 * marks then show him the place he was looking for. Where it has them only
 * apart, each word wherever it is, in reading order, so that stepping through
 * them walks him through the text the way he would read it.
 *
 * @param needs whether every word must be there for any to be marked. In his
 *   text, yes: marking the Ivos in a text that never names Andrić would say it
 *   was found. In a title in the list, no: a text found by one word in its
 *   title and the other further down shows why it is there by the one.
 * @returns matches in the order they appear, never overlapping.
 */
export function matchesIn(text: string, query: string, needs: 'every-word' | 'any-word' = 'every-word'): TextMatch[] {
  const words = wordsOf(query);
  if (words.length === 0) return [];

  // Folded here rather than taken from the note: what he is looking at may have
  // words in it he hasn't finished typing, let alone saved.
  const haystack = toSearchable(text);
  const together = phrasesIn(haystack, words, MOST_MARKS);
  if (together.length > 0 || words.length === 1) return together.map(({ start, end }) => ({ start, end }));
  if (needs === 'every-word' && !hasEveryWord(haystack, words)) return [];
  return eachWordIn(haystack, words);
}

/** Every place each of the words is, in reading order, never overlapping. */
function eachWordIn(haystack: string, words: readonly string[]): TextMatch[] {
  const every = words
    .flatMap((word) => phrasesIn(haystack, [word], MOST_MARKS))
    // Where two start together, the longer: "an" and "andric" mark "andric".
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const found: TextMatch[] = [];
  for (const { start, end } of every) {
    if (found.length === MOST_MARKS) break;
    if (start < (found.at(-1)?.end ?? 0)) continue;
    found.push({ start, end });
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
