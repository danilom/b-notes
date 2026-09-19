import type { FileInfo, FileSystem } from '../platform/file-system.ts';
import {
  baseOf,
  DELETED_FOLDER,
  EXTENSION,
  idOf,
  isConflictedCopy,
  isConvertibleNoteFile,
  isNoteFile,
  nextFreeId,
  putAwayVersionsFolderFor,
  requireNoteId,
  VERSIONS_FOLDER,
  versionName,
  versionsFolderFor,
} from './note-naming.ts';
import { deletedIdFor, planSave } from './note-saving.ts';
import { toSearchable } from '../language/diacritics.ts';
import { titleFrom } from './note-title.ts';
import { type DeletedNote, type Note, type NoteStore, isEmptyText } from './note.ts';

const nameOf = (path: string): string => path.split('/').at(-1) ?? path;

/**
 * His text as the app works with it, with Windows line endings taken out.
 *
 * His files came off Windows and end their lines with a carriage return and a
 * newline. The box he writes in cannot hold a carriage return — a textarea
 * hands back bare newlines whatever went in — so a file quietly loses them the
 * first time he touches it. That is harmless in itself, and nothing here tries
 * to put them back: one format going forward is less to go wrong than two.
 *
 * What is not harmless is comparing a file that still has them against text
 * that never could. The two differ on every single line, so an edit of one word
 * reads as the whole text having been replaced — which is the difference
 * between keeping a copy of something and keeping 582 of them. Reading is the
 * one place this can be fixed once, so it is fixed here and every comparison
 * downstream is like for like.
 */
const asWritten = (text: string): string => text.replaceAll('\r\n', '\n');

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
  async function noteFiles(from: string = folder): Promise<Map<string, FileInfo>> {
    const byId = new Map<string, FileInfo>();
    for (const file of await files.list(from)) {
      const name = nameOf(file.path);
      if (!isNoteFile(name) || isConflictedCopy(name)) continue;
      byId.set(idOf(name), file);
    }
    return byId;
  }

  /** Everything about a note that the app works with, read off one file. */
  async function noteFrom(id: string, file: FileInfo): Promise<Note> {
    const text = asWritten(await files.read(file.path));
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
  }

  const newestFirst = (first: Note, second: Note): number => second.updatedAt - first.updatedAt;

  /**
   * The newest copy kept of a note, when the note itself has nothing left in it.
   *
   * Null when the text still says something, or when nothing was kept — in both
   * cases the file is already what it should be. Versions are named for the
   * moment they were taken, so the last by name is the last there was.
   */
  /**
   * The newest copy kept of a note, or null when none was ever kept.
   *
   * Versions are named for the moment they were taken, so the last by name is
   * the last there was.
   */
  async function newestCopy(id: string): Promise<string | null> {
    // By id, not by filename, and plainly rather than by locale. Two copies in
    // one second are named "...15" and "...15 (1)", and with the extension on
    // the end the space in " (1)" sorts before the dot in ".txt" — so the newer
    // of the two came out first and the older one was read as the newest.
    const kept = [...(await files.list(at(versionsFolderFor(id))).catch(() => []))].sort(
      (first, second) => {
        const [a, b] = [idOf(nameOf(first.path)), idOf(nameOf(second.path))];
        return a < b ? -1 : a > b ? 1 : 0;
      },
    );
    const newest = kept.at(-1);
    if (newest === undefined) return null;
    return asWritten(await files.read(newest.path).catch(() => '')) || null;
  }

  /** The same, but only when the note itself has nothing left in it. */
  async function lastKeptCopy(id: string, text: string): Promise<string | null> {
    return isEmptyText(asWritten(text)) ? newestCopy(id) : null;
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
   * Moves a note's versions, one file at a time, and takes the folder with them.
   *
   * File by file because moving a folder is not something the filesystem here
   * promises to do. The folder it would otherwise leave behind is empty but not
   * harmless: a folder named after one of his texts, sitting there with nothing
   * in it, says something of his went missing.
   */
  async function moveVersions(from: string, to: string): Promise<void> {
    for (const file of await files.list(at(from)).catch(() => [])) {
      await files.rename(file.path, at(to, nameOf(file.path)));
    }
    await files.removeEmptyFolder(at(from));
    // And the Verzije folder above it, wherever that was, so one that never
    // held anything does not sit beside his writing. It stays as soon as any
    // note has a version kept.
    await files.removeEmptyFolder(at(from.slice(0, from.lastIndexOf('/'))));
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
      const notes = await Promise.all([...(await noteFiles())].map(([id, file]) => noteFrom(id, file)));
      return notes.sort(newestFirst);
    },

    async listDeleted(): Promise<DeletedNote[]> {
      const notes = await Promise.all(
        [...(await noteFiles(at(DELETED_FOLDER)))].map(async ([id, file]): Promise<DeletedNote> => {
          // Counted, not read: how many there are decides how hard it should be
          // to destroy this, and that question does not need their contents.
          const kept = await files.list(at(putAwayVersionsFolderFor(id))).catch(() => []);
          return { ...(await noteFrom(id, file)), versions: kept.length };
        }),
      );
      // By when he last worked on them, not when he put them away — nothing
      // records that, and a rename leaves a file's time alone. It is the order
      // the rest of the app uses, and it puts what he was lately working on at
      // the top, which is where he will look first.
      return notes.sort(newestFirst);
    },

    async read(id: string): Promise<string> {
      const file = (await noteFiles()).get(requireNoteId(id));
      if (file === undefined) throw new Error(`No such note: ${id}`);
      return asWritten(await files.read(file.path));
    },

    async save(id: string | null, text: string): Promise<string | null> {
      const existing = await noteFiles();
      const current = id === null ? undefined : existing.get(requireNoteId(id))?.path;

      // Read at most once, however many of the questions below want it: on a
      // 145KB essay this is the expensive part of a save.
      let asItWas: string | null = null;
      const previousText = async (): Promise<string> => {
        asItWas ??= current === undefined ? '' : asWritten(await files.read(current).catch(() => ''));
        return asItWas;
      };

      const action = await planSave(id, text, {
        takenIds: async () => new Set(existing.keys()),
        previousText,
        lastKept: async () => (id === null ? null : newestCopy(id)),
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

      // Null when it cannot be read at all, which is the one case where nothing
      // below should touch what is in it.
      const text = await files
        .read(file.path)
        .then(asWritten)
        .catch(() => null);

      /*
        A text with nothing in it and no earlier version is not a text. Filing
        it would fill the one place he goes to find something he lost with rows
        that open onto nothing.

        Both halves matter. Emptying keeps a copy of what was there, so a file
        of zero length can be the last marker of writing that still exists —
        which is why this asks about the versions and not only the length. And
        if the removal does not happen, for any reason, it falls through to
        being kept, which costs a row and loses nothing.
      */
      if (text !== null && isEmptyText(text)) {
        const versions = await files.list(at(versionsFolderFor(id))).catch(() => []);
        if (versions.length === 0 && (await files.removeEmptyFile(file.path))) return;
      }

      const kept = text === null ? null : await lastKeptCopy(id, text);

      const name = deletedIdFor(id, await idsPutAway());
      const putAway = at(DELETED_FOLDER, `${name}${EXTENSION}`);
      await files.rename(file.path, putAway);

      /*
        Written, not only moved, and for two reasons at once.

        What he emptied comes back into the file, so Obrisano holds his texts as
        he last wrote them rather than a zero-byte file named after an essay —
        which keeps the promise plain .txt was chosen for, that every file in
        there opens in Notepad and says something.

        And writing it sets the file's time to now, which is what the panel
        shows and sorts by. A text he wrote in 2019 and deleted this morning
        belongs at the top of that list, not buried among the other 2019s: what
        he just threw away is what he is most likely looking for. The cost is
        that the date he last wrote in it is not kept, which is a real loss and
        a deliberate one.
      */
      if (text !== null) await files.write(putAway, kept ?? text);

      // Its history follows it, under the name it was put away as. Left where
      // it was, the next note he happens to give the same title would inherit
      // a dead note's versions.
      await moveVersions(versionsFolderFor(id), putAwayVersionsFolderFor(name));
    },

    async destroy(id: string): Promise<void> {
      const file = (await noteFiles(at(DELETED_FOLDER))).get(requireNoteId(id));
      if (file === undefined) throw new Error(`No such deleted note: ${id}`);

      // The note first, then what was kept of it. Should this stop halfway, a
      // version left behind is invisible and harmless — nothing can inherit it,
      // since versions for a live note are kept somewhere else entirely — while
      // a note left behind with its versions destroyed would be a row he can
      // still see, emptied of the writing it was standing for.
      await files.removeFile(file.path);

      const folder = putAwayVersionsFolderFor(id);
      for (const version of await files.list(at(folder)).catch(() => [])) {
        await files.removeFile(version.path);
      }
      await files.removeEmptyFolder(at(folder));
      await files.removeEmptyFolder(at(DELETED_FOLDER, VERSIONS_FOLDER));
    },

    async restore(id: string): Promise<string> {
      const file = (await noteFiles(at(DELETED_FOLDER))).get(requireNoteId(id));
      if (file === undefined) throw new Error(`No such deleted note: ${id}`);

      // He may have written something new under the same opening words while
      // this one was away. It comes back as "Naslov (1)" rather than refusing,
      // because a text he asked for and did not get is the worse surprise.
      const back = nextFreeId(baseOf(id), null, new Set((await noteFiles()).keys()));
      await files.rename(file.path, at(`${back}${EXTENSION}`));

      // Touched on the way back, for the same reason it was touched on the way
      // out. Its old time is the moment he deleted it, which would be a strange
      // thing for a text in his list to claim — and the date he wrote it was
      // spent then. Now is the honest answer: he has just asked for it back,
      // and that is when it last changed.
      const text = await files.read(at(`${back}${EXTENSION}`)).catch(() => null);
      if (text !== null) await files.write(at(`${back}${EXTENSION}`), text);

      // The copies come with it and are not spent: throwing away the only other
      // copy at the moment of recovery is the opposite of the point.
      await moveVersions(putAwayVersionsFolderFor(id), versionsFolderFor(back));
      return back;
    },
  };
}
