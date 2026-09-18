import type { FileInfo, FileSystem } from '../platform/file-system.ts';
import {
  CONVERTIBLE_EXTENSIONS,
  DELETED_FOLDER,
  EXTENSION,
  idOf,
  isConflictedCopy,
  isConvertibleNoteFile,
  isNoteFile,
  nextFreeId,
  requireNoteId,
} from './note-naming.ts';
import { deletedIdFor, planSave } from './note-saving.ts';
import { titleFrom } from './note-title.ts';
import type { Note, NoteStore } from './note.ts';

/**
 * Everything that knows what a note is, built on nothing but somewhere to keep
 * files. One implementation, so the browser behaves exactly as the app does.
 *
 * Notes are addressed by id — the name without the extension. Which file an id
 * lives in is resolved here and nowhere else, so the rest of the app never has
 * to know that `.md` files exist at all.
 */
export function createNoteStore(files: FileSystem): NoteStore {
  /**
   * Every note's id and the file it lives in. One extension, so an id can only
   * ever name one file.
   */
  async function noteFiles(): Promise<Map<string, FileInfo>> {
    const byId = new Map<string, FileInfo>();
    for (const file of await files.list()) {
      if (!isNoteFile(file.path) || isConflictedCopy(file.path)) continue;
      byId.set(idOf(file.path), file);
    }
    return byId;
  }

  async function idsIn(folder: string): Promise<Set<string>> {
    const ids = new Set<string>();
    for (const file of await files.list(folder)) {
      ids.add(idOf(file.path.split('/').at(-1) ?? ''));
    }
    return ids;
  }

  return {
    /**
     * Renames anything he has in another format to `.txt`, and reports what it
     * couldn't.
     *
     * Windows opens `.txt` in Notepad on a double-click and has no handler for
     * `.md`, so an unconverted file is one he cannot read without this app —
     * which is the one guarantee the format was chosen for. Converting on sight
     * also means the folder settles on a single extension rather than tolerating
     * two forever.
     *
     * The content isn't inspected, on purpose. If a file does turn out to hold
     * real Markdown, nothing is lost by renaming it — the bytes are untouched
     * and nothing here renders Markdown anyway.
     *
     * A file that won't move is reported rather than skipped silently: it would
     * otherwise be invisible in the list, which reads to him as loss.
     */
    async convertToPlainText(): Promise<{ converted: number; refused: string[] }> {
      const all = await files.list();
      const taken = new Set(all.filter((file) => isNoteFile(file.path)).map((file) => idOf(file.path)));

      let converted = 0;
      const refused: string[] = [];

      for (const file of all) {
        if (!isConvertibleNoteFile(file.path) || isConflictedCopy(file.path)) continue;

        const id = nextFreeId(idOf(file.path), null, taken);
        try {
          await files.rename(file.path, `${id}${EXTENSION}`);
          taken.add(id);
          converted += 1;
        } catch {
          // One file held open elsewhere shouldn't stop the rest converting.
          refused.push(file.path);
        }
      }

      return { converted, refused };
    },

    async list(): Promise<Note[]> {
      const notes = await Promise.all(
        [...(await noteFiles())].map(async ([id, file]): Promise<Note> => {
          const text = await files.read(file.path);
          return {
            id,
            // From the text, not the name: the name is sanitised and may carry a
            // disambiguating suffix he never wrote.
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
      const file = (await noteFiles()).get(requireNoteId(id));
      if (file === undefined) throw new Error(`No such note: ${id}`);
      return files.read(file.path);
    },

    async save(id: string | null, text: string): Promise<string | null> {
      const existing = await noteFiles();
      const current = id === null ? undefined : existing.get(requireNoteId(id))?.path;

      const action = await planSave(id, text, {
        takenIds: async () => new Set(existing.keys()),
        previousText: async () =>
          current === undefined ? '' : files.read(current).catch(() => ''),
      });

      if (action.kind === 'none') return null;

      await files.write(`${action.id}${EXTENSION}`, text);
      if (action.kind === 'write') return action.id;

      await files.rename(`${action.id}${EXTENSION}`, `${action.to}${EXTENSION}`);
      return action.to;
    },

    async moveToDeleted(id: string): Promise<void> {
      const file = (await noteFiles()).get(requireNoteId(id));
      if (file === undefined) return;

      const name = deletedIdFor(id, await idsIn(DELETED_FOLDER));
      await files.rename(file.path, `${DELETED_FOLDER}/${name}${EXTENSION}`);
    },
  };
}
