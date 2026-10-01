import { withoutDiacritics } from '../language/diacritics.ts';
import { isBNotesName } from './note-naming.ts';
import { titleOfResophName } from './resoph-note.ts';

/**
 * A text in an archive, as it is shown and as it comes back into his list.
 *
 * What is put in `Arhiva` arrives in whatever shape it left an old machine:
 * Resoph's, with the title in the file's name and not in the file, or a
 * Simplenote export's, with the title inside, as `.md` or `.txt`. It is read
 * as it is and put into b-notes' shape — the title as the first line — on the
 * way to the screen, and written in that shape only when he brings it back.
 * Nothing in the archive is ever rewritten.
 */

/*
  Whether a file already opens with its title.

  Measured on the four archives off his machines: a Resoph file opens with
  his first sentence, and gets its title put above it; a Simplenote one opens
  with the title its name was made from, and is left as it is. Compared
  without case, diacritics or punctuation, which the names and first lines
  disagree about, and without a copy number — " (1)", " 2" — which only the
  name has. A name is matched as whole words, so a short title does not
  match every line that happens to begin with its letters, except a long one,
  which is a name Simplenote cut off in the middle of a word.
*/
const COPY_NUMBER = / *\(\d+\)$| +\d+$/;
const CUT_OFF = 20;

const comparable = (text: string): string =>
  withoutDiacritics(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function opensWithTitle(firstLine: string, title: string): boolean {
  const line = comparable(firstLine);
  for (const wanted of new Set([comparable(title), comparable(title.replace(COPY_NUMBER, ''))])) {
    if (wanted.length === 0) continue;
    if (line === wanted || line.startsWith(`${wanted} `)) return true;
    if (wanted.length >= CUT_OFF && line.startsWith(wanted)) return true;
  }
  // A title with no letters or digits at all, such as "- [ ]", as it is written.
  return comparable(title).length === 0 && title.trim().length > 0 && firstLine.trim().startsWith(title.trim());
}

/** One file as it is shown, and what was done to it on the way. */
export interface ArchivedText {
  text: string;
  /** Its title was only in its name, and has been put in as the first line. */
  titled: boolean;
  /** Nothing in the file but its title, which is how he jots an idea. */
  empty: boolean;
}

/**
 * An archived file's text in b-notes' shape.
 *
 * @param stem the file's name without its extension, escapes and all.
 * @param source what is in the file.
 */
export function archivedTextOf(stem: string, source: string): ArchivedText {
  const body = source.replaceAll('\r\n', '\n');
  // b-notes' own file, copied in from an old b-notes folder: in its shape
  // already, under a name that is not its title.
  if (isBNotesName(stem)) return { text: body, titled: false, empty: body.trim().length === 0 };

  const title = titleOfResophName(stem);
  // As an empty Resoph file is shown: the title, with nothing under it.
  if (body.trim().length === 0) return { text: `${title}\n\n`, titled: false, empty: true };
  const firstLine = body.split('\n').find((line) => line.trim().length > 0) ?? '';
  if (opensWithTitle(firstLine, title)) return { text: body, titled: false, empty: false };
  return { text: `${title}\n\n${body}`, titled: true, empty: false };
}
