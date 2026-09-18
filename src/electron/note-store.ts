import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { DELETED_FOLDER, EXTENSION, isConflictedCopy } from '../shared/note-naming.ts';
import type { Note, NoteStore } from '../shared/notes.ts';
import { deletedNameFor, planSave } from '../shared/save-plan.ts';
import { titleFrom } from '../shared/title.ts';

const AUTOSAVE_TEMP_SUFFIX = '.saving';

/** Ids arrive from the renderer, so confirm they name a note in this folder and nowhere else. */
function notePath(dir: string, id: string): string {
  if (id !== path.basename(id) || !id.endsWith(EXTENSION)) {
    throw new Error(`Not a note in the notes folder: ${id}`);
  }
  return path.join(dir, id);
}

async function namesIn(dir: string): Promise<Set<string>> {
  return new Set(await readdir(dir).catch(() => []));
}

/** Write to a sibling file and rename over the target, so a crash mid-write can't truncate an essay. */
async function writeAtomically(target: string, text: string): Promise<void> {
  const temp = `${target}.${process.pid}${AUTOSAVE_TEMP_SUFFIX}`;
  await writeFile(temp, text, 'utf8');
  await rename(temp, target);
}

/**
 * The filesystem half of the store: reading, writing, renaming and moving.
 *
 * Every rule about *what* a note should be called, when it counts as emptied or
 * when a save replaced rather than edited the text lives in shared code, so the
 * browser mock behaves identically. Only the file operations are here.
 */
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

    async save(id: string | null, text: string): Promise<string | null> {
      // Validate before anything else: ids arrive from the renderer.
      const current = id === null ? null : notePath(dir, id);
      await mkdir(dir, { recursive: true });

      const action = await planSave(id, text, {
        takenNames: () => namesIn(dir),
        // Reading the old text doubles the I/O on a 145KB essay, so it only
        // happens when the plan actually needs it.
        previousText: async () =>
          current === null ? '' : readFile(current, 'utf8').catch(() => ''),
      });

      if (action.kind === 'none') return null;

      await writeAtomically(path.join(dir, action.id), text);
      if (action.kind === 'write') return action.id;

      await rename(path.join(dir, action.id), path.join(dir, action.to));
      return action.to;
    },

    async moveToDeleted(id: string): Promise<void> {
      const source = notePath(dir, id);
      const trash = path.join(dir, DELETED_FOLDER);
      await mkdir(trash, { recursive: true });
      await rename(source, path.join(trash, deletedNameFor(id, await namesIn(trash))));
    },
  };
}
