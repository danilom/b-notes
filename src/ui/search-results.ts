import { toSearchable } from '../language/diacritics.ts';
import { titlePartsOf } from '../notes/title-marks.ts';
import { hasWholeWord, phrasesAlong, wordsOf } from './phrase-match.ts';

/**
 * What a search found, in the order it is worth his looking at.
 *
 * Three groups at most, because that is what he can take in at a glance: the
 * texts with it in their title, the texts with it further down, and last the
 * texts where it is only inside other words — `ivo` in "život" — which is a
 * match, but seldom the one he meant. Everything finer than that is order
 * within a group, never another heading.
 *
 * Of several words, every one must be there; see phrase-match.ts. The words
 * together, as he typed them, come before the same words apart, in whichever
 * group the text is in. A text with some of them in its title and the rest
 * further down is found in the text.
 *
 * What counts as the word: where it starts a word, or is the whole of one.
 * The two are close, and nearly always the same word — in Serbian "Andrića"
 * and "Andriću" are Andrić — so a whole word is only a little better: first
 * among titles that are otherwise alike, and first among texts that mention
 * it about as often.
 *
 * Within a group, in this order:
 *
 * 1. The few he is working on now, newest first. Recency is worth a lot for
 *    a handful of texts and nothing after that: past the last few, he is as
 *    likely to be looking for something from years ago. Not on a shelf: what
 *    is deleted or archived is nothing he is working on.
 * 2. The words together before the words apart.
 * 3. In the titles, the whole word before the start of one.
 * 4. In the texts, how often it is there as a word, in coarse steps: a text
 *    that names Andrić fifteen times is about him, one that names him once is
 *    not, and between twenty mentions and forty there is nothing to choose.
 * 5. His own order, the one Svi tekstovi is in. His leading spaces, his star
 *    and his AA and ZZ are all ways of moving a title up or down a list, so
 *    his order is his ranking, and this reads it without having to know what
 *    any of his marks means. Last, because for texts he has not marked it is
 *    only the alphabet.
 */
export interface FoundGroups<T> {
  inTitle: T[];
  inText: T[];
  /** Found only inside other words, in the title or the text; of several, one of them at least. */
  asPart: T[];
}

/** What a text needs to be searched and put in order. */
export interface Findable {
  /** His first line, as he typed it. */
  sortTitle: string;
  /** All of it, folded for searching. */
  searchable: string;
  /** The code in its file's name, which counts as part of its title. */
  code?: string | null;
  updatedAt: number;
}

/** How many texts count as the ones he is working on now. */
const WORKING_ON = 3;

/** And how recently he must have written in one for it to count. */
const RECENT_MS = 14 * 24 * 60 * 60 * 1000;

/** How many mentions make each step up: once, a few times, often, throughout. */
const MENTION_STEPS = [15, 5, 2, 1] as const;

/**
 * @param inHisOrder every text, in the order Svi tekstovi shows them.
 * @param now the moment "recent" is measured from, or null where nothing
 *   found counts as what he is working on now.
 */
export function foundGroups<T extends Findable>(
  inHisOrder: readonly T[],
  query: string,
  now: number | null,
): FoundGroups<T> {
  const words = wordsOf(query);
  if (words.length === 0) return { inTitle: [], inText: [], asPart: [] };

  const needle = toSearchable(query.trim());
  const groups: { [group in keyof FoundGroups<T>]: Ranked<T>[] } = { inTitle: [], inText: [], asPart: [] };
  inHisOrder.forEach((text, place) => {
    const found = placeOf(text, words, needle);
    if (found !== null) groups[found.group].push({ text, place, weight: found.weight });
  });

  return {
    inTitle: ordered(groups.inTitle, now),
    inText: ordered(groups.inText, now),
    asPart: ordered(groups.asPart, now),
  };
}

/** Which group a text goes in and how well it matched there; null where it was not found. */
function placeOf(
  text: Findable,
  words: readonly string[],
  needle: string,
): { group: keyof FoundGroups<unknown>; weight: number } | null {
  // The code is a name he types exactly: any match in it is a match on the text itself.
  const code = toSearchable(text.code ?? '');
  if (code.length > 0 && code.includes(needle)) return { group: 'inTitle', weight: 3 };

  const titleRead = titleAsRead(text.sortTitle);
  if (!words.every((word) => text.searchable.includes(word) || titleRead.includes(word))) return null;

  const title = matchIn(titleRead, words);
  if (title.everyWord) {
    // The phrase first; a whole word only decides between titles that are alike in that.
    const whole = title.phrase > 0 ? title.wholePhrase : title.wholeWords.every(Boolean);
    return { group: 'inTitle', weight: (title.phrase > 0 ? 2 : 0) + (whole ? 1 : 0) };
  }

  const body = matchIn(text.searchable, words);
  // Some of the words in the title and the rest further down are found in the text.
  const mentions = words.map((_, at) => Math.max(title.mentions[at] ?? 0, body.mentions[at] ?? 0));
  if (mentions.some((count) => count === 0)) return { group: 'asPart', weight: 0 };

  // The phrase first, then the step, then a whole word. Apart, the step is the
  // rarest word's: forty mentions of Ivo and one of Andrić is not about Andrić.
  const together = body.phrase > 0;
  const count = together ? body.phrase : Math.min(...mentions);
  const whole = together
    ? body.wholePhrase
    : words.every((_, at) => (body.wholeWords[at] ?? false) || (title.wholeWords[at] ?? false));
  return { group: 'inText', weight: (together ? 10 : 0) + stepOf(count) * 2 + (whole ? 1 : 0) };
}

/**
 * His title as the list reads it: his mark, his place in a series and the
 * name, as separate words. His marks run straight into the name — "AAKafana",
 * "A(E)IVO" — and the list already knows where each ends, so the name is a
 * word of its own here as it is on screen.
 */
function titleAsRead(sortTitle: string): string {
  const known = titlesRead.get(sortTitle);
  if (known !== undefined) return known;
  const { mark, position, name } = titlePartsOf(sortTitle);
  const read = toSearchable([mark, position?.series, position?.number, name].filter((part) => part != null).join(' '));
  // Bounded by the titles he has, his list and his shelves together; cleared
  // only so a title he has since changed cannot be held for good.
  if (titlesRead.size > 20_000) titlesRead.clear();
  titlesRead.set(sortTitle, read);
  return read;
}

/**
 * Each title as read, worked out once rather than for every text on every
 * letter typed: the title is the same, and an archive is thousands of them.
 */
const titlesRead = new Map<string, string>();

interface Matches {
  /** How many times the words stand together as words, beginning a word or whole; up to `ENOUGH`. */
  phrase: number;
  /** Whether the phrase is there once at least as whole words. */
  wholePhrase: boolean;
  /** How many times each word is there as a word, in the order he typed them; up to `ENOUGH`. */
  mentions: number[];
  /** Whether each word is there once at least as a whole word. */
  wholeWords: boolean[];
  /** Whether each word is somewhere there as a word. */
  everyWord: boolean;
}

/**
 * How the words are in one piece of his writing.
 *
 * Counted as words, never inside other words: `ivo` in "život" is only ever
 * enough for the last group, and a text that names Ivo once is no more about
 * him for mentioning life fifty times.
 */
function matchIn(haystack: string, words: readonly string[]): Matches {
  const phrase = tally(haystack, words);
  // One word is its own phrase, and looking for it twice is half the cost of
  // ranking a whole archive by it.
  const each = words.length === 1 ? [phrase] : words.map((word) => tally(haystack, [word]));
  const mentions = each.map(({ count }) => count);
  return {
    phrase: phrase.count,
    wholePhrase: phrase.whole,
    mentions,
    wholeWords: each.map(({ whole }) => whole),
    everyWord: mentions.every((count) => count > 0),
  };
}

/** Past this many, more mentions change nothing: it is the top step. */
const ENOUGH = MENTION_STEPS[0];

/**
 * How many times the words stand together as words, up to `ENOUGH`, and
 * whether once as whole words. Counting stops as soon as both are settled,
 * which in an ordinary text is within the first few lines: counting every
 * "je" in three thousand archived texts was most of a second per letter.
 */
function tally(haystack: string, words: readonly string[]): { count: number; whole: boolean } {
  let count = 0;
  let whole = false;
  const [only] = words.length === 1 ? words : [];
  for (const { kind } of phrasesAlong(haystack, words)) {
    if (kind === 'inside') continue;
    count += 1;
    whole ||= kind === 'whole';
    if (count < ENOUGH) continue;
    if (whole) break;
    // Counted enough, and every one so far only begins a longer word: one
    // word is asked once whether it is whole anywhere further on.
    if (only !== undefined) return { count, whole: hasWholeWord(haystack, only) };
  }
  return { count, whole };
}

interface Ranked<T> {
  text: T;
  /** Where it stands in his order. */
  place: number;
  /** How well it matched, within its group: higher is better. */
  weight: number;
}

function ordered<T extends Findable>(found: Ranked<T>[], now: number | null): T[] {
  const working = new Set(
    found
      .filter(({ text }) => now !== null && now - text.updatedAt <= RECENT_MS)
      .sort((a, b) => b.text.updatedAt - a.text.updatedAt)
      .slice(0, WORKING_ON),
  );
  return found
    .sort((a, b) => {
      const aWorking = working.has(a);
      const bWorking = working.has(b);
      if (aWorking !== bWorking) return aWorking ? -1 : 1;
      if (aWorking) return b.text.updatedAt - a.text.updatedAt;
      return b.weight - a.weight || a.place - b.place;
    })
    .map(({ text }) => text);
}

/** Which step a number of mentions reaches: 4 for fifteen or more, down to 1 for one. */
function stepOf(count: number): number {
  const reached = MENTION_STEPS.findIndex((step) => count >= step);
  return reached === -1 ? 0 : MENTION_STEPS.length - reached;
}
