/**
 * How a note's text becomes a filename, and how collisions are resolved.
 *
 * Pure on purpose. Both stores use these, so the browser mock produces exactly
 * the ids the real filesystem would — a mock that names things differently
 * would quietly invalidate anything judged against it.
 */

/**
 * We write `.txt`. Windows opens it in Notepad on a double-click while `.md` has
 * no default handler, and the whole fallback plan is that he can read his own
 * writing without this app.
 */
export const NEW_NOTE_EXTENSION = '.txt';

/**
 * We read both, because his existing corpus already holds `.md` files.
 *
 * A note keeps the extension it arrived with. Changing what kind of file
 * something is while he types would be exactly the sort of surprise this app
 * exists to avoid; converting them is migration's job, done deliberately.
 */
export const NOTE_EXTENSIONS: readonly string[] = ['.txt', '.md'];

export function isNoteFile(fileName: string): boolean {
  return NOTE_EXTENSIONS.some((extension) => fileName.endsWith(extension));
}

/** The extension a note already has, so saving can keep it. */
export function extensionOf(fileName: string): string {
  return NOTE_EXTENSIONS.find((extension) => fileName.endsWith(extension)) ?? NEW_NOTE_EXTENSION;
}

/**
 * A note's id is its filename without the extension — never a path, and never
 * carrying `.txt` or `.md`.
 *
 * Which means ids have to be unique where filenames alone would not be:
 * `Esej.md` and `Esej.txt` are one id, not two, and the second of them has to
 * become `Esej (1)`.
 *
 * Ids are derived from his own text and can also arrive from a stale session
 * file or a listing we didn't write, so they're checked. Any subfolder path,
 * such as a put-away note, is built by the store rather than accepted.
 */
export function idOf(fileName: string): string {
  const extension = NOTE_EXTENSIONS.find((candidate) => fileName.endsWith(candidate));
  return extension === undefined ? fileName : fileName.slice(0, -extension.length);
}

export function isNoteId(candidate: string): boolean {
  if (candidate.includes('/') || candidate.includes('\\')) return false;
  return candidate.length > 0 && candidate.trim() === candidate && !isNoteFile(candidate);
}

export function requireNoteId(candidate: string): string {
  if (!isNoteId(candidate)) throw new Error(`Not the name of a note: ${candidate}`);
  return candidate;
}

/**
 * Where put-away notes go. Visible and in his language, because if he ever goes
 * looking through the folder himself this is the one place he might need.
 */
export const DELETED_FOLDER = 'Obrisano';

/** Dropbox renames one side of a sync collision to "essay (Someone's conflicted copy 2026-09-18).txt". */
const CONFLICTED_COPY = /\(.+conflicted copy \d{4}-\d{2}-\d{2}(?: \d+)?\)/i;

/** Our own disambiguating suffix, which looks exactly like Simplenote's. */
const COPY_SUFFIX = / \(\d+\)$/;

const RESERVED_CHARACTERS = '<>:"/\\|?*';
const RESERVED_ON_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function isConflictedCopy(fileName: string): boolean {
  return CONFLICTED_COPY.test(fileName);
}

/**
 * Windows rejects the reserved punctuation outright, and control characters
 * have no business in a filename. Written as a check rather than a regex so no
 * invisible character has to appear in this file.
 */
function withoutUnusableCharacters(title: string): string {
  let out = '';
  for (const character of title) {
    const code = character.codePointAt(0) ?? 0;
    out += RESERVED_CHARACTERS.includes(character) || code < 32 ? ' ' : character;
  }
  return out;
}

/** The filename a title wants, before any collision is resolved. */
export function fileNameBase(title: string): string {
  const cleaned = withoutUnusableCharacters(title)
    .replace(/\s+/g, ' ')
    .trim()
    // Windows silently drops trailing dots, which would desync name from title.
    .replace(/\.+$/, '')
    .trim();

  if (cleaned.length === 0) return 'Bez naslova';
  if (RESERVED_ON_WINDOWS.test(cleaned)) return `_${cleaned}`;
  return cleaned;
}

/**
 * An id with any disambiguating suffix removed, for comparing against a freshly
 * derived name.
 *
 * Only ever used for that comparison — the title itself always comes from the
 * text, never from parsing an id, so a suffix can't accumulate.
 */
export function baseOf(id: string): string {
  return idOf(id).replace(COPY_SUFFIX, '');
}

/**
 * The first unused id for `base`, treating the note's own id as free.
 *
 * `taken` holds ids, not filenames, so an existing `Esej.md` stops a new note
 * from claiming `Esej` — the two would otherwise be one id over two files.
 */
export function nextFreeId(base: string, own: string | null, taken: ReadonlySet<string>): string {
  for (let attempt = 0; ; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base} (${attempt})`;
    if (candidate === own || !taken.has(candidate)) return candidate;
  }
}
