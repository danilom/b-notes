/**
 * What a ResophNotes file means, read the way Resoph reads it.
 *
 * Resoph keeps a note's title in the filename and writes only the rest of the
 * note into the file (its `fileincludetitle` setting, off on his machines). In
 * Resoph the title shows as the note's first line. So a file opened on its own
 * has no title, and the first line of its text is his opening sentence, a
 * section number or a note to himself — which is what 0.7.0 showed him as
 * titles. See `RESOPH-COEXISTENCE.md`.
 *
 * Pure, and shared by both hosts: the browser mock has to read Resoph's folder
 * exactly as the installed app does.
 */

/**
 * The characters Resoph cannot put in a filename, as it writes them instead.
 *
 * Only these are read back. A general `%XX` decode would also turn a `%41` he
 * had typed into an `A`, and only these ever came out of Resoph: 341 `%2A`,
 * 25 `%3F`, 15 `%2F`, 6 `%5C`, 2 `%3A` and 1 `%09` in his folder. The rest of
 * Windows' forbidden set is here because Resoph would have to escape it the
 * same way, and `%25` in case it escapes its own escape character.
 */
const ESCAPED: ReadonlyMap<string, string> = new Map([
  ['2A', '*'],
  ['3F', '?'],
  ['2F', '/'],
  ['5C', '\\'],
  ['3A', ':'],
  ['09', '\t'],
  ['22', '"'],
  ['3C', '<'],
  ['3E', '>'],
  ['7C', '|'],
  ['25', '%'],
]);

/**
 * The title Resoph shows for a file, from the file's name without `.txt`.
 *
 * Spaces are kept exactly, leading and trailing ones included: he puts them
 * there on purpose, to rank a text in a list sorted by title.
 */
export function titleOfResophName(stem: string): string {
  return stem.replace(/%([0-9A-Fa-f]{2})/g, (escape, code: string) => ESCAPED.get(code.toUpperCase()) ?? escape);
}

/** The first line with anything in it, compared loosely: case, spacing and ends aside. */
function sameLine(first: string, second: string): boolean {
  const loose = (line: string): string => line.replace(/\s+/g, ' ').trim().toLowerCase();
  return loose(first) === loose(second);
}

/**
 * The note as Resoph shows it: the title, then what the file holds.
 *
 * Except where the file already starts with that title. His ~300 texts from a
 * 2023 Simplenote export carry it inside as well, and Resoph shows those with
 * the title twice. Shown once here: the doubled line is an accident of how the
 * files were moved, not something he wrote.
 *
 * @param body the file's text, with line endings already made `\n`.
 */
export function composeResophText(title: string, body: string): string {
  const firstLine = body.split('\n').find((line) => line.trim().length > 0);
  if (firstLine !== undefined && sameLine(firstLine, title)) return body;
  return body.length === 0 ? title : `${title}\n${body}`;
}

/**
 * An id for a text that lives in Resoph's folder and nowhere else yet.
 *
 * Marked so it can never be mistaken for one of b-notes' own: those are plain
 * filenames, and `:` is a character no Windows filename can hold. After the
 * mark, the file's name exactly as it is on disk, spaces and escapes and all.
 */
const RESOPH_MARK = 'resoph:';

export function resophIdOf(stem: string): string {
  return `${RESOPH_MARK}${stem}`;
}

export function isResophId(id: string): boolean {
  return id.startsWith(RESOPH_MARK);
}

/** The name on disk behind a Resoph id, or null if the id is not one. */
export function resophStemOf(id: string): string | null {
  return isResophId(id) ? id.slice(RESOPH_MARK.length) : null;
}
