/** Long enough to tell two essays apart, short enough to read in the list. */
export const MAX_TITLE = 50;

/** Below this, breaking at a space would leave too little of the title. */
const SHORTEST_WORD_BREAK = 30;

/**
 * The title as he sees it: his own first line, punctuation and all.
 *
 * Not necessarily the first line of the file — he indents, and leaves blank
 * lines above his text. There is no separate title anywhere; naming things is
 * exactly what he won't do.
 */
export function titleFrom(text: string): string {
  const first = text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
  const cleaned = first.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= MAX_TITLE) return cleaned;

  const cut = cleaned.slice(0, MAX_TITLE);
  const lastSpace = cut.lastIndexOf(' ');
  // Cutting mid-word is how Resoph produced titles he couldn't tell apart, so
  // prefer a word boundary — unless one very long word would leave a stub.
  return (lastSpace >= SHORTEST_WORD_BREAK ? cut.slice(0, lastSpace) : cut).trim();
}
