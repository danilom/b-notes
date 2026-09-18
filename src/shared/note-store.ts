import type { FileSystem } from './file-system.ts';
import { DELETED_FOLDER, EXTENSION, isConflictedCopy } from './note-naming.ts';
import type { Note, NoteStore } from './notes.ts';
import { deletedNameFor, planSave } from './save-plan.ts';
import { titleFrom } from './title.ts';

/**
 * Everything that knows what a note is, built on nothing but a place to keep
 * files. One implementation, so the browser behaves exactly as the installed
 * app does.
 */
export function createNoteStore(files: FileSystem): NoteStore {
  const namesIn = async (folder?: string): Promise<Set<string>> =>
    new Set((await files.list(folder)).map((file) => file.path.split('/').at(-1) ?? ''));

  return {
    async list(): Promise<Note[]> {
      const wanted = (await files.list()).filter(
        (file) => file.path.endsWith(EXTENSION) && !isConflictedCopy(file.path),
      );

      const notes = await Promise.all(
        wanted.map(async (file): Promise<Note> => {
          const text = await files.read(file.path);
          return {
            id: file.path,
            // From the text, not the filename: the filename is sanitised and may
            // carry a disambiguating suffix he never wrote.
            title: titleFrom(text),
            text,
            updatedAt: file.updatedAt,
            bytes: file.bytes,
          };
        }),
      );

      return notes.sort((first, second) => second.updatedAt - first.updatedAt);
    },

    async read(id: string): Promise<string> {
      return files.read(id);
    },

    async save(id: string | null, text: string): Promise<string | null> {
      const action = await planSave(id, text, {
        takenNames: () => namesIn(),
        // Reading the old text doubles the work on a 145KB essay, so it only
        // happens when the plan actually needs it.
        previousText: async () => (id === null ? '' : files.read(id).catch(() => '')),
      });

      if (action.kind === 'none') return null;

      await files.write(action.id, text);
      if (action.kind === 'write') return action.id;

      await files.rename(action.id, action.to);
      return action.to;
    },

    async moveToDeleted(id: string): Promise<void> {
      const name = deletedNameFor(id, await namesIn(DELETED_FOLDER));
      await files.rename(id, `${DELETED_FOLDER}/${name}`);
    },
  };
}
