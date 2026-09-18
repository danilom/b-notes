/**
 * How a note's text becomes a filename, and how collisions are resolved.
 *
 * Pure on purpose. Both stores use these, so the browser mock produces exactly
 * the ids the real filesystem would — a mock that names things differently
 * would quietly invalidate anything judged against it.
 */

/**
 * `.txt`, not `.md`. Windows opens `.txt` in Notepad on a double-click while
 * `.md` has no default handler — and the whole fallback plan is that he can
 * open his writing without this app.
 */
export const EXTENSION = '.txt';

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
 * A filename with its extension and any disambiguating suffix removed, for
 * comparing against a freshly derived name.
 *
 * Only ever used for that comparison — the title itself always comes from the
 * text, never from parsing a filename, so a suffix can't accumulate.
 */
export function baseOf(fileName: string): string {
  const withoutExtension = fileName.endsWith(EXTENSION)
    ? fileName.slice(0, -EXTENSION.length)
    : fileName;
  return withoutExtension.replace(COPY_SUFFIX, '');
}

/** The first unused name for `base`, treating the note's own filename as free. */
export function nextFreeName(base: string, own: string | null, taken: ReadonlySet<string>): string {
  for (let attempt = 0; ; attempt += 1) {
    const candidate = attempt === 0 ? `${base}${EXTENSION}` : `${base} (${attempt})${EXTENSION}`;
    if (candidate === own || !taken.has(candidate)) return candidate;
  }
}
