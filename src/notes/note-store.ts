import type { FileInfo, FileSystem } from '../platform/file-system.ts';
import {
  DELETED_FOLDER,
  NEW_NOTE_EXTENSION,
  NOTE_EXTENSIONS,
  extensionOf,
  idOf,
  isConflictedCopy,
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
   * Every note's id and the file it lives in.
   *
   * Two files can want one id — `Esej.md` and `Esej.txt` both ask for `Esej` —
   * and his corpus is old enough that this will eventually happen. The loser
   * takes the next free id rather than being dropped, because a note quietly
   * missing from the list is the failure this whole app exists to prevent.
   *
   * Nothing is renamed on disk for it. The assignment is deterministic — our own
   * format keeps the plain id, then alphabetical — so the same folder always
   * produces the same ids, and his files are left as they are.
   */
  async function noteFiles(): Promise<Map<string, FileInfo>> {
    const candidates = (await files.list())
      .filter((file) => isNoteFile(file.path) && !isConflictedCopy(file.path))
      .sort(
        (first, second) =>
          NOTE_EXTENSIONS.indexOf(extensionOf(first.path)) -
            NOTE_EXTENSIONS.indexOf(extensionOf(second.path)) ||
          first.path.localeCompare(second.path),
      );

    const byId = new Map<string, FileInfo>();
    for (const file of candidates) {
      const wanted = idOf(file.path);
      byId.set(byId.has(wanted) ? nextFreeId(wanted, null, new Set(byId.keys())) : wanted, file);
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

      // A note keeps the extension it arrived with. Changing what kind of file
      // something is while he types is not ours to do; converting them is
      // migration's job, done deliberately.
      const extension = current === undefined ? NEW_NOTE_EXTENSION : extensionOf(current);

      await files.write(`${action.id}${extension}`, text);
      if (action.kind === 'write') return action.id;

      await files.rename(`${action.id}${extension}`, `${action.to}${extension}`);
      return action.to;
    },

    async moveToDeleted(id: string): Promise<void> {
      const file = (await noteFiles()).get(requireNoteId(id));
      if (file === undefined) return;

      const name = deletedIdFor(id, await idsIn(DELETED_FOLDER));
      await files.rename(file.path, `${DELETED_FOLDER}/${name}${extensionOf(file.path)}`);
    },
  };
}
