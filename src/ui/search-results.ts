import { toSearchable } from '../language/diacritics.ts';
import { titlePartsOf } from '../notes/title-marks.ts';

/**
 * What a search found, in the order it is worth his looking at.
 *
 * Three groups at most, because that is what he can take in at a glance: the
 * texts with it in their title, the texts with it further down, and last the
 * texts where it is only inside other words — `ivo` in "život" — which is a
 * match, but seldom the one he meant. Everything finer than that is order
 * within a group, never another heading.
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
 *    likely to be looking for something from years ago.
 * 2. In the titles, the whole word before the start of one.
 * 3. In the texts, how often it is there as a word, in coarse steps: a text
 *    that names Andrić fifteen times is about him, one that names him once is
 *    not, and between twenty mentions and forty there is nothing to choose.
 * 4. His own order, the one Svi tekstovi is in. His leading spaces, his star
 *    and his AA and ZZ are all ways of moving a title up or down a list, so
 *    his order is his ranking, and this reads it without having to know what
 *    any of his marks means. Last, because for texts he has not marked it is
 *    only the alphabet.
 */
export interface FoundGroups<T> {
  inTitle: T[];
  inText: T[];
  /** Found only inside other words, in the title or the text. */
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
 * @param now the moment "recent" is measured from.
 */
export function foundGroups<T extends Findable>(inHisOrder: readonly T[], query: string, now: number): FoundGroups<T> {
  const needle = toSearchable(query.trim());
  if (needle.length === 0) return { inTitle: [], inText: [], asPart: [] };

  const inTitle: Ranked<T>[] = [];
  const inText: Ranked<T>[] = [];
  const asPart: Ranked<T>[] = [];
  inHisOrder.forEach((text, place) => {
    const title = matchIn(titleAsRead(text.sortTitle), needle);
    const code = toSearchable(text.code ?? '');
    // The code is a name he types exactly: any match in it is a match on the text itself.
    if (title.whole > 0 || (code.length > 0 && code.includes(needle))) {
      inTitle.push({ text, place, weight: 2 });
      return;
    }
    if (title.start > 0) {
      inTitle.push({ text, place, weight: 1 });
      return;
    }
    const body = matchIn(text.searchable, needle);
    const words = body.whole + body.start;
    if (words > 0) {
      // The step first; a whole word only decides between texts in the same one.
      inText.push({ text, place, weight: stepOf(words) * 2 + (body.whole > 0 ? 1 : 0) });
    } else if (title.inside + body.inside > 0) {
      asPart.push({ text, place, weight: 0 });
    }
  });

  return { inTitle: ordered(inTitle, now), inText: ordered(inText, now), asPart: ordered(asPart, now) };
}

/**
 * His title as the list reads it: his mark, his place in a series and the
 * name, as separate words. His marks run straight into the name — "AAKafana",
 * "A(E)IVO" — and the list already knows where each ends, so the name is a
 * word of its own here as it is on screen.
 */
function titleAsRead(sortTitle: string): string {
  const { mark, position, name } = titlePartsOf(sortTitle);
  return toSearchable([mark, position?.series, position?.number, name].filter((part) => part != null).join(' '));
}

interface Matches {
  whole: number;
  start: number;
  inside: number;
}

/** How many times the needle is there as a whole word, at the start of one, and inside one. */
function matchIn(haystack: string, needle: string): Matches {
  const found = { whole: 0, start: 0, inside: 0 };
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) {
    const end = at + needle.length;
    if (!wordBreak(haystack, at)) found.inside += 1;
    else if (wordBreak(haystack, end)) found.whole += 1;
    else found.start += 1;
  }
  return found;
}

const LETTER = /\p{L}/u;
const DIGIT = /\p{N}/u;

/**
 * Whether a word begins or ends at this point: at either end of the text,
 * beside anything that is not a letter or a digit, or where letters meet
 * digits. That last is for his series numbers, glued to the name as often
 * as not — "5Nosac", "3USAoc" — where the name is still a word.
 */
function wordBreak(text: string, at: number): boolean {
  if (at === 0 || at === text.length) return true;
  const before = text.charAt(at - 1);
  const after = text.charAt(at);
  const kind = (letter: string): 'letter' | 'digit' | 'other' =>
    LETTER.test(letter) ? 'letter' : DIGIT.test(letter) ? 'digit' : 'other';
  const a = kind(before);
  const b = kind(after);
  return a === 'other' || b === 'other' || a !== b;
}

interface Ranked<T> {
  text: T;
  /** Where it stands in his order. */
  place: number;
  /** How well it matched, within its group: higher is better. */
  weight: number;
}

function ordered<T extends Findable>(found: Ranked<T>[], now: number): T[] {
  const working = new Set(
    found
      .filter(({ text }) => now - text.updatedAt <= RECENT_MS)
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
