import { type FileSystem, FolderMissing } from '../platform/file-system.ts';
import type { Log } from '../platform/logging.ts';
import { type Note, type NoteStore, type NoteVersion, noteOf } from './note.ts';
import { EXTENSION, RESOPH_LINKS_FOLDER, copyNameFor, idOf } from './note-naming.ts';
import type { NoteRenamed, OwnNoteStore } from './note-store.ts';
import type { ResophFolder } from './resoph-folder.ts';
import { resophIdOf, resophStemOf } from './resoph-note.ts';

const nameOf = (path: string): string => path.split('/').at(-1) ?? path;

/** What a copy kept straight from Resoph is labelled, among a text's versions. */
export const FROM_RESOPH = 'Resoph';

/**
 * Every text he has: b-notes' own, and the ones still only in Resoph.
 *
 * A Resoph text is shown straight from Resoph's file and looks like any other.
 * The first time anything changes it — an edit, a kept copy, deleting it —
 * b-notes copies it into its own folder and acts on the copy. From then on the
 * copy is the text, and the Resoph file is left exactly as it was: b-notes
 * never writes to Resoph's folder. See `RESOPH-COEXISTENCE.md` §4.
 *
 * A copy is found by name. Its name is worked out from the Resoph file's, so
 * the same on every machine, and a Resoph text with a copy is simply not
 * listed — whether the copy is in his list, in Obrisano, or destroyed.
 *
 * @param resoph his Resoph folder, or null on a machine that has none.
 * @param renamed told when a Resoph text becomes b-notes' copy, so anything
 * holding it by its Resoph id follows it.
 */
export function createNoteLibrary(
  own: OwnNoteStore,
  resoph: ResophFolder | null,
  files: FileSystem,
  folder: string,
  log: Log,
  renamed: NoteRenamed = () => undefined,
): NoteStore {
  const linksFolder = `${folder}/${RESOPH_LINKS_FOLDER}`;

  /** Copies whose link was written: including any he has since destroyed. */
  async function linkedNames(): Promise<Set<string>> {
    try {
      return new Set((await files.list(linksFolder)).map((file) => idOf(nameOf(file.path))));
    } catch (failure: unknown) {
      // Not there until the first Resoph text is taken in, which is ordinary.
      if (!(failure instanceof FolderMissing)) throw failure;
      return new Set();
    }
  }

  /**
   * Every name that means "this Resoph text has a copy". The links, and the
   * copies themselves, in case a link failed to be written after its copy.
   */
  async function takenIn(): Promise<Set<string>> {
    const [links, live, putAway] = await Promise.all([linkedNames(), own.liveIds(), own.putAwayIds()]);
    return new Set([...links, ...live, ...putAway]);
  }

  /**
   * Makes a Resoph text b-notes' own, and hands back the copy's id.
   *
   * The Resoph original is kept first, as a version labelled as such, so it is
   * always there to go back to. Then the copy. Then the link. Stopping after
   * the copy shows the text twice until the next try, which is untidy; the
   * other order could hide it, which is not allowed.
   */
  async function takeIn(stem: string): Promise<string> {
    const copy = copyNameFor(stem);
    if ((await own.liveIds()).has(copy)) {
      renamed(resophIdOf(stem), copy);
      return copy;
    }

    const original = await resoph?.read(stem);
    if (original === null || original === undefined) throw new Error(`No such Resoph text: ${stem}`);

    await own.keepLabelledCopy(copy, original.text, FROM_RESOPH);
    await own.save(copy, original.text);
    await files.write(`${linksFolder}/${copy}${EXTENSION}`, stem);
    log.info('Took a text from Resoph into b-notes', { from: stem, to: copy });
    renamed(resophIdOf(stem), copy);
    return copy;
  }

  /** The Resoph texts with no copy, as notes. */
  async function resophNotes(): Promise<Note[]> {
    if (resoph === null) return [];
    const [texts, taken] = await Promise.all([resoph.list(), takenIn()]);
    return texts
      .filter(({ stem }) => !taken.has(copyNameFor(stem)))
      .map(({ stem, file, text }) => noteOf(resophIdOf(stem), text, file.updatedAt, file.bytes));
  }

  return {
    async list(): Promise<Note[]> {
      const [mine, fromResoph] = await Promise.all([own.list(), resophNotes()]);
      return [...mine, ...fromResoph].sort((first, second) => second.updatedAt - first.updatedAt);
    },

    async read(id: string): Promise<string> {
      const stem = resophStemOf(id);
      if (stem === null) return own.read(id);
      const found = await resoph?.read(stem);
      if (found === null || found === undefined) throw new Error(`No such Resoph text: ${stem}`);
      return found.text;
    },

    async save(id: string | null, text: string): Promise<string | null> {
      const stem = id === null ? null : resophStemOf(id);
      if (stem === null) return own.save(id, text);
      return own.save(await takeIn(stem), text);
    },

    async keepCopy(id: string, text: string): Promise<string> {
      const stem = resophStemOf(id);
      return own.keepCopy(stem === null ? id : await takeIn(stem), text);
    },

    async moveToDeleted(id: string): Promise<void> {
      const stem = resophStemOf(id);
      await own.moveToDeleted(stem === null ? id : await takeIn(stem));
    },

    // A text still only in Resoph has had nothing kept of it yet.
    countVersions: async (id: string): Promise<number> => (resophStemOf(id) === null ? own.countVersions(id) : 0),
    listVersions: async (id: string): Promise<NoteVersion[]> =>
      resophStemOf(id) === null ? own.listVersions(id) : [],

    listDeleted: () => own.listDeleted(),
    restore: (id) => own.restore(id),
    destroy: (id) => own.destroy(id),
    listArchives: () => own.listArchives(),
    listArchived: (liveTitles) => own.listArchived(liveTitles),
    bringBack: (archive, id) => own.bringBack(archive, id),
  };
}
