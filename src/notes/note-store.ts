import type { FileInfo, FileSystem } from '../platform/file-system.ts';
import {
  DELETED_FOLDER,
  EXTENSION,
  idOf,
  isConflictedCopy,
  isConvertibleNoteFile,
  isNoteFile,
  nextFreeId,
  putAwayVersionsFolderFor,
  requireNoteId,
  versionName,
  versionsFolderFor,
} from './note-naming.ts';
import { deletedIdFor, planSave } from './note-saving.ts';
import { toSearchable } from '../language/diacritics.ts';
import { titleFrom } from './note-title.ts';
import type { Note, NoteStore } from './note.ts';

const nameOf = (path: string): string => path.split('/').at(-1) ?? path;

/**
 * Everything that knows what a note is, built on nothing but somewhere to keep
 * files. One implementation, so the browser behaves exactly as the app does.
 *
 * Notes are addressed by id — the name without the extension or any folder. The
 * path a note actually lives at is worked out here and nowhere else, so nothing
 * above this knows where his writing is kept.
 */
export function createNoteStore(files: FileSystem, folder: string): NoteStore {
  const at = (...parts: string[]): string => [folder, ...parts].join('/');

  /**
   * Every note's id and the file it lives in. One extension, so an id can only
   * ever name one file.
   */
  async function noteFiles(): Promise<Map<string, FileInfo>> {
    const byId = new Map<string, FileInfo>();
    for (const file of await files.list(folder)) {
      const name = nameOf(file.path);
      if (!isNoteFile(name) || isConflictedCopy(name)) continue;
      byId.set(idOf(name), file);
    }
    return byId;
  }

  /**
   * Keeps one earlier version of a note.
   *
   * Named for the moment it was taken, and never overwriting one already there
   * — two versions of the same note within a second is barely possible, but the
   * cost of being wrong is the text this whole thing exists to save.
   */
  async function keepVersion(id: string, text: string): Promise<void> {
    const folder = versionsFolderFor(id);
    const taken = new Set((await files.list(at(folder)).catch(() => [])).map((file) => idOf(nameOf(file.path))));
    const name = nextFreeId(versionName(new Date()), null, taken);
    await files.write(at(folder, `${name}${EXTENSION}`), text);
  }

  /**
   * Moves a note's versions, one file at a time.
   *
   * File by file because moving a folder is not something the filesystem here
   * promises to do. The empty folder it leaves behind is untidy and harmless;
   * removing it needs a way to delete a folder, which nothing else has wanted
   * yet.
   */
  async function moveVersions(id: string, putAwayAs: string): Promise<void> {
    const from = versionsFolderFor(id);
    const to = putAwayVersionsFolderFor(putAwayAs);
    for (const file of await files.list(at(from)).catch(() => [])) {
      await files.rename(file.path, at(to, nameOf(file.path)));
    }
  }

  async function idsPutAway(): Promise<Set<string>> {
    const found = await files.list(at(DELETED_FOLDER)).catch(() => []);
    return new Set(found.map((file) => idOf(nameOf(file.path))));
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
      const all = await files.list(folder);
      const taken = new Set(
        all.filter((file) => isNoteFile(nameOf(file.path))).map((file) => idOf(nameOf(file.path))),
      );

      let converted = 0;
      const refused: string[] = [];

      for (const file of all) {
        const name = nameOf(file.path);
        if (!isConvertibleNoteFile(name) || isConflictedCopy(name)) continue;

        const id = nextFreeId(idOf(name), null, taken);
        try {
          await files.rename(file.path, at(`${id}${EXTENSION}`));
          taken.add(id);
          converted += 1;
        } catch {
          // One file held open elsewhere shouldn't stop the rest converting.
          refused.push(name);
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
            searchable: toSearchable(text),
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
        previousText: async () => (current === undefined ? '' : files.read(current).catch(() => '')),
      });

      if (action.kind === 'none') return null;

      // Before the write, and if it fails the write does not happen: this save
      // is about to destroy the only copy, so a version he cannot keep is a
      // reason not to proceed. He sees "not saved" and the next autosave tries
      // again; his text stays on disk in the meantime.
      if (action.kind === 'write' && action.snapshot !== undefined) {
        await keepVersion(action.id, action.snapshot);
      }

      await files.write(at(`${action.id}${EXTENSION}`), text);
      if (action.kind === 'write') return action.id;

      await files.rename(at(`${action.id}${EXTENSION}`), at(`${action.to}${EXTENSION}`));
      return action.to;
    },

    async moveToDeleted(id: string): Promise<void> {
      const file = (await noteFiles()).get(requireNoteId(id));
      if (file === undefined) return;

      const name = deletedIdFor(id, await idsPutAway());
      await files.rename(file.path, at(DELETED_FOLDER, `${name}${EXTENSION}`));

      // Its history follows it, under the name it was put away as. Left where
      // it was, the next note he happens to give the same title would inherit
      // a dead note's versions.
      await moveVersions(id, name);
    },
  };
}
