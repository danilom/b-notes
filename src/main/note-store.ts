import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Note, NoteStore } from '../shared/notes.ts';
import { titleFrom } from '../shared/title.ts';

/**
 * `.txt`, not `.md`. Windows opens `.txt` in Notepad on a double-click while
 * `.md` has no default handler — and the whole fallback plan is that he can
 * open his writing without this app.
 */
const EXTENSION = '.txt';
const AUTOSAVE_TEMP_SUFFIX = '.saving';

/**
 * Where emptied notes go. Visible and in his language, because if he ever goes
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

/** Ids arrive from the renderer, so confirm they name a note in this folder and nowhere else. */
function notePath(dir: string, id: string): string {
  if (id !== path.basename(id) || !id.endsWith(EXTENSION)) {
    throw new Error(`Not a note in the notes folder: ${id}`);
  }
  return path.join(dir, id);
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

/** Write to a sibling file and rename over the target, so a crash mid-write can't truncate an essay. */
async function writeAtomically(target: string, text: string): Promise<void> {
  const temp = `${target}.${process.pid}${AUTOSAVE_TEMP_SUFFIX}`;
  await writeFile(temp, text, 'utf8');
  await rename(temp, target);
}

/**
 * Whether a save replaced the text rather than edited it.
 *
 * A proportion rather than a byte count, so it means the same thing for a
 * 200-byte jot and a 145KB essay.
 */
export function survivedTooLittle(previous: string, next: string): boolean {
  if (previous.length === 0) return false;
  return next.trim().length < previous.trim().length * 0.1;
}

/** The first free name for `base`, treating the note's own filename as free. */
async function freeFileName(dir: string, base: string, own: string | null): Promise<string> {
  for (let attempt = 0; ; attempt += 1) {
    const candidate = attempt === 0 ? `${base}${EXTENSION}` : `${base} (${attempt})${EXTENSION}`;
    if (candidate === own) return candidate;
    if (!(await exists(path.join(dir, candidate)))) return candidate;
  }
}

/**
 * Moves emptied notes into the deleted folder, and reports how many moved.
 *
 * Clearing a note's text is how he deletes — he never found Resoph's delete
 * command, and his old corpus carries dozens of files he had emptied out but
 * which still sat in the list. An empty row tells him nothing, so they belong
 * somewhere he can still get at them.
 *
 * Only ever run at startup. Sweeping while he's working would make a note
 * disappear from the list moments after he emptied it, which is precisely the
 * kind of unexplained movement that unsettles him.
 */
export async function sweepEmptiedNotes(dir: string): Promise<number> {
  await mkdir(dir, { recursive: true });
  const entries = await readdir(dir, { withFileTypes: true });
  let moved = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(EXTENSION)) continue;

    const source = path.join(dir, entry.name);
    if ((await readFile(source, 'utf8')).trim().length > 0) continue;

    const trash = path.join(dir, DELETED_FOLDER);
    await mkdir(trash, { recursive: true });
    const name = await freeFileName(trash, baseOf(entry.name), null);
    await rename(source, path.join(trash, name));
    moved += 1;
  }

  return moved;
}

export function createFileNoteStore(dir: string): NoteStore {
  return {
    async list(): Promise<Note[]> {
      await mkdir(dir, { recursive: true });
      const entries = await readdir(dir, { withFileTypes: true });

      const notes = await Promise.all(
        entries
          .filter(
            (entry) =>
              entry.isFile() && entry.name.endsWith(EXTENSION) && !isConflictedCopy(entry.name),
          )
          .map(async (entry): Promise<Note> => {
            const file = path.join(dir, entry.name);
            const [info, text] = await Promise.all([stat(file), readFile(file, 'utf8')]);
            return {
              id: entry.name,
              // From the text, not the filename: the filename is sanitised and
              // may carry a disambiguating suffix he never wrote.
              title: titleFrom(text),
              text,
              updatedAt: info.mtimeMs,
              bytes: info.size,
            };
          }),
      );

      return notes.sort((first, second) => second.updatedAt - first.updatedAt);
    },

    async read(id: string): Promise<string> {
      return readFile(notePath(dir, id), 'utf8');
    },

    /**
     * Writes the text, creating the note when `id` is null and renaming it when
     * his first line changed. Returns the note's id, which may differ from the
     * one passed in.
     *
     * Returns null rather than creating anything for a new note with no text —
     * empty notes are the single largest category of debris in his old corpus.
     */
    async save(id: string | null, text: string): Promise<string | null> {
      if (id === null && text.trim().length === 0) return null;

      await mkdir(dir, { recursive: true });
      const base = fileNameBase(titleFrom(text));

      if (id === null) {
        const name = await freeFileName(dir, base, null);
        await writeAtomically(path.join(dir, name), text);
        return name;
      }

      const current = notePath(dir, id);

      // Same base means the filename already reflects his first line; leaving it
      // alone avoids renaming the file on every keystroke.
      if (baseOf(id) === base) {
        await writeAtomically(current, text);
        return id;
      }

      // Only read the old text when a rename is on the table, which is rare —
      // doing it on every save would double the I/O on a 145KB essay.
      const previous = await readFile(current, 'utf8').catch(() => '');
      await writeAtomically(current, text);

      // Trimming is ordinary and should still rename: cutting "foo bar whatever"
      // down to "whatever" is an edit. But when almost nothing survives, the
      // text didn't get shorter, it got replaced — and the old filename is then
      // the last evidence of what the note was.
      if (survivedTooLittle(previous, text)) return id;

      const name = await freeFileName(dir, base, id);
      await rename(current, path.join(dir, name));
      return name;
    },
  };
}
