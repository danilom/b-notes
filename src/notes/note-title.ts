/** Long enough to tell two essays apart, short enough to read in the list. */
export const MAX_TITLE = 50;

/** Below this, breaking at a space would leave too little of the title. */
const SHORTEST_WORD_BREAK = 30;

/**
 * A title shorter than this tells him nothing, so it keeps reading past a blank
 * line to find something that does. Four characters or fewer is exactly the
 * population of useless titles his old corpus accumulated.
 */
const TOO_SHORT_TO_HELP = 5;

/**
 * The title as he sees it, built from the start of his text.
 *
 * There is no title anywhere else — naming things is precisely what he won't
 * do — so this is a preview whose only job is helping him recognise the note.
 * That is why it keeps going when the opening is too short to mean anything:
 * "S" is not a title, "S Pišem ti podstaknut" is.
 *
 * Consecutive lines are joined, because he writes titles stacked and indented.
 * A blank line ends it once there's enough to recognise.
 */
export function titleFrom(text: string): string {
  const lines = text.split(/\r?\n/);
  const parts: string[] = [];
  let seenText = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      // A blank line ends the title, unless what we have is still useless.
      if (seenText && parts.join(' ').length >= TOO_SHORT_TO_HELP) break;
      continue;
    }

    seenText = true;
    parts.push(trimmed);
    if (parts.join(' ').length >= MAX_TITLE) break;
  }

  const cleaned = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= MAX_TITLE) return cleaned;

  const cut = cleaned.slice(0, MAX_TITLE);
  const lastSpace = cut.lastIndexOf(' ');
  // Cutting mid-word is how Resoph produced titles he couldn't tell apart, so
  // prefer a word boundary — unless one very long word would leave a stub.
  return (lastSpace >= SHORTEST_WORD_BREAK ? cut.slice(0, lastSpace) : cut).trim();
}
