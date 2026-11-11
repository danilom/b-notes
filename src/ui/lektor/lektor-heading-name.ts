/*
  His text's title made fit to quote in one line of the Lektor's own sentences ("Utisak AI Lektora o
  tekstu „X”:", "AI Lektor čita tekst „X”…"). His titles are whatever he typed or pasted: leading
  spaces that file them, his own quotes, a pasted paragraph, a stray control character.
*/

/** Past this, the name is cut at a word: a pasted paragraph as a title would otherwise bury the line. */
const LONGEST_NAME = 60;

/** Quote marks he may have put round his own title, which the sentence's own „…” would double. */
const OUTER_QUOTES = /^["'„“”«»‚‘’]+|["'„“”«»‚‘’]+$/g;

/**
 * Control characters and runs of spaces, tabs or line breaks become one space, the ends are trimmed,
 * his own outer quotes come off, and a long one is cut at a word with "…".
 *
 * @param title The title as the list shows it (`titleFrom`).
 * @returns Null when nothing is left, so the sentence can say "bez naslova" in words.
 */
export function nameForHeading(title: string): string | null {
  // \p{Cc} rather than spelling out the ranges: a pasted tab, line break or stray control character alike.
  const flat = title.replace(/[\p{Cc}\s]+/gu, ' ').trim().replace(OUTER_QUOTES, '').trim();
  if (flat === '') return null;
  if (flat.length <= LONGEST_NAME) return flat;
  const cut = flat.slice(0, LONGEST_NAME);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > LONGEST_NAME / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
