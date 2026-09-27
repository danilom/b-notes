import type { FileSystem } from '../platform/file-system.ts';
import type { Log } from '../platform/logging.ts';
import { type Note, type NoteStore, type NoteVersion, noteOf } from './note.ts';
import { EXTENSION, copyNameFor, unusedName } from './note-naming.ts';
import { type Naming, type NoteRenamed, type OwnNoteStore, REAL_NAMING } from './note-store.ts';
import type { ResophFolder, ResophText } from './resoph-folder.ts';
import { resophIdOf, resophStemOf } from './resoph-note.ts';
import { type StubKind, isStub, stubText } from './resoph-stub.ts';

/** What a copy kept straight from Resoph is labelled, among a text's versions. */
export const FROM_RESOPH = 'Resoph';

/** The store over both folders. */
export type NoteLibrary = NoteStore;

/** A path as Windows writes it, for the line in a stub whoever recovers the text will read. */
const windowsPath = (path: string): string => path.replaceAll('/', '\\');

/**
 * Every text he has: b-notes' own, and the ones still in Resoph.
 *
 * A text lives in one of the two at a time. One still in Resoph is shown
 * straight from Resoph's file. The first time he types in it, or deletes it,
 * b-notes takes it over: the text is copied into b-notes' folder, and a stub
 * is left in Resoph's file in place of his words, saying where they went. A
 * file holding a stub is not listed. See `RESOPH-COEXISTENCE.md` §4.
 *
 * Nothing is kept in step between the two: a Resoph file that is not a stub is
 * a text of his, whatever b-notes holds besides.
 *
 * @param resoph his Resoph folder, or null on a machine that has none.
 * @param renamed told when a Resoph text becomes b-notes' copy, so anything
 * holding it by its Resoph id follows it.
 * @param naming the machine and the moment, for the stub's record lines.
 */
export function createNoteLibrary(
  own: OwnNoteStore,
  resoph: ResophFolder | null,
  files: FileSystem,
  folder: string,
  log: Log,
  renamed: NoteRenamed = () => undefined,
  naming: Naming = REAL_NAMING,
): NoteLibrary {
  /**
   * Each Resoph text as a note, kept by its file's time and size.
   *
   * Working a note out folds all of its text for searching, and over his 11MB
   * that was half a second every time b-notes came back to the front — on his
   * slowest laptop, a pause every time he switches back. Only a file that has
   * changed is worked out again. It is also what he last saw of each text.
   */
  const described = new Map<string, { seenAs: string; note: Note }>();

  function noteFor({ stem, file, text }: ResophText): Note {
    const seenAs = `${file.updatedAt}|${file.bytes}`;
    const held = described.get(stem);
    if (held !== undefined && held.seenAs === seenAs) return held.note;
    const note = noteOf(resophIdOf(stem), text, file.updatedAt, file.bytes);
    described.set(stem, { seenAs, note });
    return note;
  }

  /** The texts still in Resoph, as notes: every file there that is not a stub. */
  async function resophNotes(): Promise<Note[]> {
    if (resoph === null) return [];
    const texts = await resoph.list();
    const present = new Set(texts.map(({ stem }) => stem));
    for (const stem of described.keys()) if (!present.has(stem)) described.delete(stem);
    return texts.filter(({ body }) => !isStub(body)).map(noteFor);
  }

  /**
   * Takes a text over from Resoph, and hands back the id of b-notes' copy.
   *
   * The copy is made of what he saw: the words b-notes last listed, which are
   * the ones in front of him. Resoph's words as they are now are kept among
   * its versions, whatever happens next. The copy is read back before
   * anything is written into Resoph's file, since after that the stub stands
   * where his words were.
   */
  async function takeOver(stem: string, kind: StubKind): Promise<string> {
    const original = await resoph?.read(stem);
    if (original === null || original === undefined) throw new Error(`No such Resoph text: ${stem}`);
    const seen = described.get(stem)?.note.text ?? original.text;

    const taken = new Set([...(await own.liveIds()), ...(await own.putAwayIds())]);
    const copy = unusedName(copyNameFor(stem), taken);
    await own.keepLabelledCopy(copy, original.text, FROM_RESOPH);
    await own.save(copy, seen);
    if ((await own.read(copy)) !== seen) throw new Error(`The copy of a Resoph text did not read back: ${copy}`);

    await leaveStub(stem, seen, copy, kind);
    renamed(resophIdOf(stem), copy);
    log.info('Took a text over from Resoph', { from: stem, to: copy, kind });
    return copy;
  }

  /**
   * The stub, written only over the words that were taken. If Resoph's file
   * changed while he had it open — another machine's Resoph — it is left as it
   * is, and shows as a text of its own beside the one b-notes took.
   */
  async function leaveStub(stem: string, taken: string, copy: string, kind: StubKind): Promise<void> {
    const now = await resoph?.read(stem);
    if (resoph === null || now?.text !== taken) {
      log.warn("Resoph's file changed while it was being taken over; it is left as it is", { stem, copy });
      return;
    }
    const path = windowsPath(`${folder}/${copy}${EXTENSION}`);
    await resoph.write(stem, stubText({ kind, when: naming.now(), machine: naming.machine, path }));
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
      return own.save(stem === null ? id : await takeOver(stem, 'moved'), text);
    },

    async keepCopy(id: string, text: string): Promise<string> {
      const stem = resophStemOf(id);
      return own.keepCopy(stem === null ? id : await takeOver(stem, 'moved'), text);
    },

    async moveToDeleted(id: string): Promise<void> {
      const stem = resophStemOf(id);
      await own.moveToDeleted(stem === null ? id : await takeOver(stem, 'deleted'));
    },

    // A text still in Resoph has had nothing kept of it yet.
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
