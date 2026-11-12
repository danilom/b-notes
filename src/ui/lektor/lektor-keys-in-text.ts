import type { Choice } from './lektor-service.ts';

/*
  The keys in whatever he copied: a message from whoever sent them, a note, the two keys alone,
  in any order, separated by anything or by nothing at all. Found by what each key looks like
  rather than by where it sits, so labels, quotes, punctuation and the rest of an email around
  them are simply not keys.

  OpenRouter's are `sk-or-v1-` and 64 hex digits. Google's are of two kinds: the older `AIza` and
  35 more, and the newer `AQ.` and a run of the same characters, whose length Google does not
  state, so the whole run is taken. OpenRouter's are taken out first: their characters are all
  ones a Google key may hold, and one glued straight after a Google key would otherwise be read
  as more of it.
*/

/** Characters editors and mail programs slip in that look like nothing, and would split a key. */
const INVISIBLE = /[​-‍⁠﻿­]/g;

const OPENROUTER = /sk-or-v1-[0-9a-fA-F]{64}/;
const GOOGLE_OLDER = /AIza[0-9A-Za-z_-]{35}/;
/** Shorter than this is a word that happens to start "AQ.", not a key. */
const GOOGLE_NEWER = /AQ\.[0-9A-Za-z_-]{30,}/;

export type KeysFound = Partial<Record<Choice, string>>;

/** The first key of each service in the text; none found is an empty object. */
export function keysInText(text: string): KeysFound {
  const visible = text.replace(INVISIBLE, '');
  const found: KeysFound = {};
  const paid = OPENROUTER.exec(visible)?.[0];
  if (paid !== undefined) found.paid = paid;
  const rest = visible.replace(new RegExp(OPENROUTER.source, 'g'), ' ');
  const free = firstOf(rest, [GOOGLE_OLDER, GOOGLE_NEWER]);
  if (free !== undefined) found.free = free;
  return found;
}

/** Whichever of the patterns matches earliest in the text. */
function firstOf(text: string, patterns: readonly RegExp[]): string | undefined {
  let earliest: RegExpExecArray | null = null;
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match !== null && (earliest === null || match.index < earliest.index)) earliest = match;
  }
  return earliest?.[0];
}
