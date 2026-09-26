/** Long enough to tell two essays apart, short enough to read in the list. */
export const MAX_TITLE = 50;

/** Below this, breaking at a space would leave too little of the title. */
const SHORTEST_WORD_BREAK = 30;

/**
 * A title shorter than this tells him nothing, so it keeps reading — past a
 * line ending, past a blank line, as far as it needs to — to find something
 * that does. Four characters or fewer is exactly the
 * population of useless titles his old corpus accumulated.
 */
const TOO_SHORT_TO_HELP = 5;

/**
 * Where his writing starts, as against where his text starts.
 *
 * The first line is the name — it is what the file is called and what the list
 * shows — so it is the one place a caret should not be dropped by the app. Put
 * one there and a single absent-minded keystroke renames the text and moves it
 * in the list, which reads from outside as the text having gone.
 *
 * Just past the first line ending, or the very start when there is no second
 * line: one text in nine of his is a single unbroken block, and in those there
 * is nowhere that is not the name.
 *
 * Not an exact inverse of `titleFrom`, deliberately. That keeps reading past
 * short lines until it has something worth showing, so for a text opening with
 * four characters or fewer the title reaches the line below and typing there
 * still renames it. Mirroring the rule exactly would couple two things that
 * would then have to be kept in step forever, to buy a minority of a minority.
 */
export function writingStartsAt(text: string): number {
  const ending = text.indexOf('\n');
  return ending === -1 ? 0 : ending + 1;
}

/**
 * The title as he sees it, built from the start of his text.
 *
 * There is no title anywhere else — naming things is precisely what he won't
 * do — so this is a preview whose only job is helping him recognise the note.
 * That is why it keeps going when the opening is too short to mean anything:
 * "S" is not a title, "S Pišem ti podstaknut" is.
 *
 * Any line ending stops it once there is enough to recognise, not only a blank
 * one. This used to need a blank line, on the grounds that he writes titles
 * stacked over several lines — but of his 581 existing texts, 553 have a blank
 * line after the opening and not one has a usable opening followed straight on
 * by more. That pattern belonged to his old exporter, not to him. Writing here
 * he will press Enter once far more often than twice, and swallowing his first
 * sentence into the title is exactly what he would not expect.
 */
export function titleFrom(text: string): string {
  const lines = text.split(/\r?\n/);
  const parts: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Blank lines above it and between its parts count for nothing while there
    // is still nothing worth showing him.
    if (trimmed.length === 0) continue;

    parts.push(trimmed);
    if (parts.join(' ').length >= TOO_SHORT_TO_HELP) break;
  }

  const cleaned = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= MAX_TITLE) return cleaned;

  const cut = cleaned.slice(0, MAX_TITLE);
  const lastSpace = cut.lastIndexOf(' ');
  // Cutting mid-word is how Resoph produced titles he couldn't tell apart, so
  // prefer a word boundary — unless one very long word would leave a stub.
  return (lastSpace >= SHORTEST_WORD_BREAK ? cut.slice(0, lastSpace) : cut).trim();
}
