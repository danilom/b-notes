import { toSearchable } from '../language/diacritics.ts';

/**
 * How a search of several words is matched, wherever one is: in the list, the
 * shelves, the marks in his text.
 *
 * A text is found when every word he typed is in it. Some of them only would
 * make the list longer the more he typed, the opposite of what typing more is
 * for. Where they stand next to each other in the order he typed them, that is
 * the phrase, and the phrase is what he nearly always means: a name, a place,
 * a saying. Words apart are a weaker find, and still a better one than a word
 * found only inside another word.
 *
 * One word is a phrase of one, so a search of one word is matched exactly as
 * it always was.
 */
export interface PhraseMatch {
  readonly start: number;
  /** Where the last word he typed ends, not the word in the text it begins. */
  readonly end: number;
  /**
   * `whole` where every word is a whole word in the text; `start` where some
   * only begin one, "Ivom Andrićem" for "ivo andric"; `inside` where the
   * first is inside another word, "ivo" in "život".
   */
  readonly kind: 'whole' | 'start' | 'inside';
}

/** What he typed, folded as his texts are, a word at a time. */
export function wordsOf(query: string): string[] {
  return toSearchable(query)
    .split(/\s+/u)
    .filter((word) => word.length > 0);
}

/** Whether every word is somewhere in it, anywhere, together or apart. */
export function hasEveryWord(haystack: string, words: readonly string[]): boolean {
  return words.length > 0 && words.every((word) => haystack.includes(word));
}

/**
 * Every place the words stand together, in order, never overlapping.
 *
 * Together means each word begins the word in the text after the last one,
 * with only spaces, punctuation or a line break between: his words decline,
 * and "Ivom Andrićem" is Ivo Andrić as much as "Ivo, Andrić" is.
 *
 * @param most where to stop counting, for a search that would find thousands.
 */
export function phrasesIn(haystack: string, words: readonly string[], most = Infinity): PhraseMatch[] {
  const found: PhraseMatch[] = [];
  for (const phrase of phrasesAlong(haystack, words)) {
    if (found.length >= most) break;
    found.push(phrase);
  }
  return found;
}

/**
 * The same places, one at a time from the start, for whoever can stop before
 * the end: ranking needs to know only whether a word is there a few times or
 * many, and his longest texts have it thousands of times.
 */
export function* phrasesAlong(haystack: string, words: readonly string[]): Generator<PhraseMatch> {
  const [first, ...rest] = words;
  if (first === undefined) return;
  let at = haystack.indexOf(first);
  while (at !== -1) {
    const tail = restOfPhrase(haystack, at + first.length, rest);
    if (tail === null) {
      at = haystack.indexOf(first, at + first.length);
      continue;
    }
    const kind = !wordBreak(haystack, at) ? 'inside' : tail.whole ? 'whole' : 'start';
    yield { start: at, end: tail.end, kind };
    at = haystack.indexOf(first, tail.end);
  }
}

/** Where the rest of the words end, if each begins the next word from `from`; null if one does not. */
function restOfPhrase(haystack: string, from: number, rest: readonly string[]): { end: number; whole: boolean } | null {
  let end = from;
  let whole = wordBreak(haystack, end);
  for (const word of rest) {
    const next = nextWordFrom(haystack, end, word);
    if (next === null) return null;
    end = next + word.length;
    whole &&= wordBreak(haystack, end);
  }
  return { end, whole };
}

/**
 * Where `word` starts, if it starts the next word after `from`: past the rest
 * of the word `from` is in, and then anywhere in what lies between words, for
 * a word he typed with its bracket or quote in front.
 */
function nextWordFrom(haystack: string, from: number, word: string): number | null {
  let at = from;
  while (!wordBreak(haystack, at)) at += 1;
  if (at === haystack.length) return null;
  for (; at <= haystack.length; at += 1) {
    if (haystack.startsWith(word, at)) return at;
    if (at === haystack.length || isWordCharacter(haystack.charAt(at))) return null;
  }
  return null;
}

const LETTER = /\p{L}/u;
const DIGIT = /\p{N}/u;

function isWordCharacter(character: string): boolean {
  return kindOf(character) !== 'other';
}

/**
 * Whether a word begins or ends at this point: at either end of the text,
 * beside anything that is not a letter or a digit, or where letters meet
 * digits. That last is for his series numbers, glued to the name as often
 * as not — "5Nosac", "3USAoc" — where the name is still a word.
 */
export function wordBreak(text: string, at: number): boolean {
  if (at === 0 || at === text.length) return true;
  const before = kindOf(text.charAt(at - 1));
  const after = kindOf(text.charAt(at));
  return before === 'other' || after === 'other' || before !== after;
}

/**
 * Whether a word is anywhere in it as a whole word, by the same rule as
 * `wordBreak`: not run on from a character of the same kind as its own first
 * or last. One pass of the regular expression engine rather than a look at
 * every place the word begins — for a short word that only ever begins
 * longer ones, thousands of places in a long text, every one of them a no.
 */
export function hasWholeWord(haystack: string, word: string): boolean {
  if (word.length === 0) return false;
  return wholeWordPattern(word).test(haystack);
}

const wholeWordPatterns = new Map<string, RegExp>();

function wholeWordPattern(word: string): RegExp {
  const known = wholeWordPatterns.get(word);
  if (known !== undefined) return known;
  const unlike = (kind: ReturnType<typeof kindOf>): string =>
    kind === 'letter' ? '\\p{L}' : kind === 'digit' ? '\\p{N}' : '';
  const before = unlike(kindOf(word.charAt(0)));
  const after = unlike(kindOf(word.charAt(word.length - 1)));
  const literal = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `${before === '' ? '' : `(?<!${before})`}${literal}${after === '' ? '' : `(?!${after})`}`,
    'u',
  );
  // One search box's words at a time; a bound only so a long session cannot grow it.
  if (wholeWordPatterns.size > 100) wholeWordPatterns.clear();
  wholeWordPatterns.set(word, pattern);
  return pattern;
}

/**
 * What a character is, for telling where words are. Answered from its code
 * where it is plain ASCII, which a folded text nearly all is: asking the
 * Unicode classes about every letter was most of what ranking an archive cost.
 */
function kindOf(character: string): 'letter' | 'digit' | 'other' {
  const code = character.charCodeAt(0);
  if (code < 0x80) {
    if ((code >= 0x61 && code <= 0x7a) || (code >= 0x41 && code <= 0x5a)) return 'letter';
    return code >= 0x30 && code <= 0x39 ? 'digit' : 'other';
  }
  return LETTER.test(character) ? 'letter' : DIGIT.test(character) ? 'digit' : 'other';
}
