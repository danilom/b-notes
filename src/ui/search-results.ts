import { toSearchable } from '../language/diacritics.ts';

/**
 * What a search found, in the order it is worth his looking at.
 *
 * Two groups and no more, because two is what he can take in at a glance:
 * the texts with it in their title, and the texts with it only further down.
 * Everything finer than that is order within a group, never another heading.
 *
 * Within a group, in this order:
 *
 * 1. The few he is working on now, newest first. Recency is worth a lot for
 *    a handful of texts and nothing after that: past the last few, he is as
 *    likely to be looking for something from years ago.
 * 2. In the titles, a match at the start of a word before one inside a word:
 *    `andric` finds "ANDRIC i Njegos" before "Dandrice".
 * 3. In the texts, how often it is there, in coarse steps: a text that names
 *    Andrić fifteen times is about him, one that names him once is not, and
 *    between twenty mentions and forty there is nothing to choose.
 * 4. His own order, the one Svi tekstovi is in. His leading spaces, his star
 *    and his AA and ZZ are all ways of moving a title up or down a list, so
 *    his order is his ranking, and this reads it without having to know what
 *    any of his marks means. Last, because for texts he has not marked it is
 *    only the alphabet.
 */
export interface FoundGroups<T> {
  inTitle: T[];
  inText: T[];
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
  if (needle.length === 0) return { inTitle: [], inText: [] };

  const inTitle: Ranked<T>[] = [];
  const inText: Ranked<T>[] = [];
  inHisOrder.forEach((text, place) => {
    const title = toSearchable(text.sortTitle);
    const code = toSearchable(text.code ?? '');
    if (title.includes(needle) || (code.length > 0 && code.includes(needle))) {
      inTitle.push({ text, place, weight: startsAWord(title, needle) ? 1 : 0 });
    } else if (text.searchable.includes(needle)) {
      inText.push({ text, place, weight: stepOf(mentions(text.searchable, needle)) });
    }
  });

  return { inTitle: ordered(inTitle, now), inText: ordered(inText, now) };
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

/** Whether it is there at the start of a word, rather than only inside one. */
function startsAWord(haystack: string, needle: string): boolean {
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
    if (at === 0 || !/[\p{L}\p{N}]/u.test(haystack.charAt(at - 1))) return true;
  }
  return false;
}

/** How many times, never counting one letter twice. */
function mentions(haystack: string, needle: string): number {
  let count = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) count += 1;
  return count;
}

/** Which step a number of mentions reaches: 4 for fifteen or more, down to 1 for one. */
function stepOf(count: number): number {
  const reached = MENTION_STEPS.findIndex((step) => count >= step);
  return reached === -1 ? 0 : MENTION_STEPS.length - reached;
}
