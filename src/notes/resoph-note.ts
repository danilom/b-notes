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

/** The characters a filename cannot hold, and how Resoph writes each: the reverse of `ESCAPED`. */
const ESCAPES: ReadonlyMap<string, string> = new Map([...ESCAPED].map(([code, character]) => [character, `%${code}`]));

/**
 * The file name Resoph gives a title, without `.txt`: each character a
 * filename cannot hold written as Resoph writes it — `%2A` for `*` — and
 * nothing else touched. Spaces, leading and trailing, are part of his title.
 * The exact reverse of `titleOfResophName`.
 */
export function resophNameFor(title: string): string {
  return [...title].map((character) => ESCAPES.get(character) ?? character).join('');
}

/**
 * A text split the way Resoph keeps it: the title — the first line with
 * anything in it, exactly as typed — and the rest, less the one blank line
 * Resoph shows between the two. The reverse of `composeResophText`.
 */
export function resophPartsOf(text: string): { title: string; body: string } {
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  const at = lines.findIndex((line) => line.trim().length > 0);
  if (at === -1) return { title: '', body: '' };
  const rest = lines.slice(at + 1);
  if (rest[0]?.trim() === '') rest.shift();
  return { title: lines[at] ?? '', body: rest.join('\n') };
}

/** The first line with anything in it, compared loosely: case, spacing and ends aside. */
function sameLine(first: string, second: string): boolean {
  const loose = (line: string): string => line.replace(/\s+/g, ' ').trim().toLowerCase();
  return loose(first) === loose(second);
}

/**
 * The note as Resoph shows it: the title, a blank line, then what the file
 * holds — a file with nothing in it included, which is the title and the
 * blank line.
 *
 * Checked against Resoph itself rather than inferred: over his whole corpus,
 * every one of the 1,215 notes in Resoph's own database is exactly this
 * (`scripts/check-resoph-reading.mts`). An earlier guess of one line break
 * matched none of them.
 *
 * One difference, on purpose: where the file already starts with that title.
 * His ~300 texts from a 2023 Simplenote export carry it inside as well, and
 * Resoph shows those with the title twice. Shown once here: the doubled line
 * is an accident of how the files were moved, not something he wrote.
 *
 * @param body the file's text, with line endings already made `\n`.
 */
export function composeResophText(title: string, body: string): string {
  const firstLine = body.split('\n').find((line) => line.trim().length > 0);
  if (firstLine !== undefined && sameLine(firstLine, title)) return body;
  return `${title}\n\n${body}`;
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
