import {
  type FileInfo,
  type FileSystem,
  FileMissing,
  FolderMissing,
} from '../platform/file-system.ts';
import { type Log, describeError } from '../platform/logging.ts';
import {
  DELETED_FOLDER,
  EXTENSION,
  idOf,
  ARCHIVE_FOLDER,
  archiveFolderFor,
  archivedVersionsFolderFor,
  isNoteFile,
  newNameFor,
  nextFreeId,
  putAwayVersionsFolderFor,
  requireNoteId,
  unusedName,
  VERSIONS_FOLDER,
  versionName,
  versionsFolderFor,
} from './note-naming.ts';
import { planSave } from './note-saving.ts';
import { titleFrom } from './note-title.ts';
import {
  type Archive,
  type ArchivedNote,
  type DeletedNote,
  type Note,
  type NoteStore,
  type NoteVersion,
  isEmptyText,
  noteOf,
} from './note.ts';

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
/**
 * Told whenever a text he can edit changes its name.
 *
 * Nothing is renamed any more, but a text can still change which name the app
 * holds it by — a Resoph text becoming b-notes' own copy the first time he
 * edits it — and anything above holding it by the old name would be quietly
 * wrong from that moment.
 */
export type NoteRenamed = (from: string, to: string) => void;

/**
 * What a new text's name is made from besides its title: when, and on which
 * machine. See `newNameFor`.
 */
export interface Naming {
  machine: string;
  now: () => Date;
}

export const REAL_NAMING: Naming = { machine: 'PC', now: () => new Date() };

/** What a copy is labelled when something other than b-notes changed the file. */
export const CHANGED_ELSEWHERE = 'izmenjeno drugde';

/**
 * The store over b-notes' own folder, with what the library over it needs to
 * take a Resoph text in: which names are in use, and a way to keep a copy
 * that says where it came from.
 */
export interface OwnNoteStore extends NoteStore {
  /** Every text in the folder, by id. */
  liveIds(): Promise<Set<string>>;
  /** Every text put away in Obrisano, by id. */
  putAwayIds(): Promise<Set<string>>;
  /**
   * Keeps a copy of a text, named for the moment and a word saying where it
   * came from — `2026-09-27 14-32-10 Resoph`.
   */
  keepLabelledCopy(id: string, text: string, label: string): Promise<string>;
}

export function createNoteStore(
  files: FileSystem,
  folder: string,
  log: Log,
  renamed: NoteRenamed = () => undefined,
  naming: Naming = REAL_NAMING,
): OwnNoteStore {
  const at = (...parts: string[]): string => [folder, ...parts].join('/');

  /**
   * Each text as b-notes last saw it on disk: read, listed or written.
   *
   * So a save can tell when the file changed behind b-notes' back — another
   * machine's edit arriving through Dropbox, Notepad — and keep what was there
   * before writing over it. His words in the box still win: he is typing them
   * now. But the other text is not lost, only put among the versions.
   */
  const lastSeen = new Map<string, string>();

  /**
   * What is in a folder we may never have made.
   *
   * `Verzije/` and `Obrisano/` come into being the first time they are used, so
   * asking about one that is not there yet is an ordinary question with an
   * empty answer. So does b-notes' folder itself: his writing is Resoph's, and
   * this one is made by the first text b-notes writes — on every machine's
   * first start it is rightly not there yet. Whether his writing can be
   * reached is asked of the Resoph folder, before anything is read.
   *
   * Everything else — a drive that has gone, a permission Windows changed —
   * comes out as empty too, and should not. That is a gap rather than a
   * decision: the filesystem contract has no way to say which failure this was,
   * so there is nothing here to tell them apart with. It is one place to fix
   * rather than the eight it used to be spread across.
   */
  async function filesIn(folder: string): Promise<FileInfo[]> {
    try {
      return await files.list(folder);
    } catch (failure: unknown) {
      // Only the folder we have not made yet: it comes into being the first
      // time it is used, so asking about one before then is an ordinary
      // question with an empty answer — and nothing else is, which is why
      // everything else goes up to somebody who can say so.
      if (!(failure instanceof FolderMissing)) throw failure;
      return [];
    }
  }

  /** A file's text, or nothing at all where it cannot be had. Same gap as above. */
  async function textOf(path: string): Promise<string | null> {
    try {
      return await files.read(path);
    } catch (failure: unknown) {
      if (!(failure instanceof FileMissing)) throw failure;
      return null;
    }
  }

  /**
   * Every note's id and the file it lives in. One extension, so an id can only
   * ever name one file.
   */
  async function noteFiles(from: string = folder): Promise<Map<string, FileInfo>> {
    const byId = new Map<string, FileInfo>();
    for (const file of await filesIn(from)) {
      const name = nameOf(file.path);
      // Conflicted copies included. Dropbox made them of his writing, and a
      // text hidden because of how it is named is a text he has lost.
      if (!isNoteFile(name)) continue;
      byId.set(idOf(name), file);
    }
    return byId;
  }

  /** The same, for the folder of texts he has put away. */
  async function putAwayFiles(): Promise<Map<string, FileInfo>> {
    return noteFiles(at(DELETED_FOLDER));
  }

  /** Everything about a note that the app works with, read off one file. */
  async function noteFrom(id: string, file: FileInfo): Promise<Note> {
    // The title from the text, not the name: the name is made safe and
    // carries a tag he never wrote.
    return noteOf(id, asWritten(await files.read(file.path)), file.updatedAt, file.bytes);
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
    const kept = [...(await filesIn(at(versionsFolderFor(id))))].sort(
      (first, second) => {
        const [a, b] = [idOf(nameOf(first.path)), idOf(nameOf(second.path))];
        return a < b ? -1 : a > b ? 1 : 0;
      },
    );
    const newest = kept.at(-1);
    if (newest === undefined) return null;
    return asWritten((await textOf(newest.path)) ?? '') || null;
  }

  /** The same, but only when the note itself has nothing left in it. */
  async function lastKeptCopy(id: string, text: string): Promise<string | null> {
    return isEmptyText(asWritten(text)) ? newestCopy(id) : null;
  }

  /**
   * A copy of this note that already says exactly this, if there is one.
   *
   * What stops a restore breeding copies. Bringing a version back keeps what he
   * had, and what he had is very often a copy already sitting in the folder —
   * he restores one, changes his mind, restores the other, and each trip
   * deliberately wrote down a text that was already written down. Four round
   * trips, four new files, two of every text.
   *
   * It reads them all, which the dialog that led him here has just done too.
   * The ordinary save does not do this: it has the coalescing rule instead, and
   * this is the guard for the one caller that deliberately steps around it.
   */
  async function sameCopy(id: string, text: string): Promise<string | null> {
    const kept = await filesIn(at(versionsFolderFor(id)));
    const texts = await Promise.all(
      kept.map(async (file) => asWritten((await textOf(file.path)) ?? '')),
    );

    const at_ = texts.indexOf(text);
    const found = at_ === -1 ? undefined : kept[at_];
    return found === undefined ? null : idOf(nameOf(found.path));
  }

  /**
   * Keeps one earlier version of a note.
   *
   * Named for the moment it was taken, and never overwriting one already there
   * — two versions of the same note within a second is barely possible, but the
   * cost of being wrong is the text this whole thing exists to save.
   */
  async function keepVersion(id: string, text: string, label?: string): Promise<string> {
    const folder = versionsFolderFor(id);
    const taken = new Set((await filesIn(at(folder))).map((file) => idOf(nameOf(file.path))));
    const moment = versionName(new Date());
    const name = nextFreeId(label === undefined ? moment : `${moment} ${label}`, null, taken);
    await files.write(at(folder, `${name}${EXTENSION}`), text);
    // The safety net firing. Rare, and the one line that answers "where did the
    // paragraph I deleted go" — which is the reason any of this exists.
    log.info('Kept a copy of a text before writing over it', { id, copy: name });
    return name;
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
    for (const file of await filesIn(at(from))) {
      await files.rename(file.path, at(to, nameOf(file.path)));
    }
    await files.removeEmptyFolder(at(from));
    // And the Verzije folder above it, wherever that was, so one that never
    // held anything does not sit beside his writing. It stays as soon as any
    // note has a version kept.
    await files.removeEmptyFolder(at(from.slice(0, from.lastIndexOf('/'))));
  }

  /** Files in one archive folder, by id. Absence is ordinary: most folders have none. */
  async function archivedFiles(archive: string): Promise<Map<string, FileInfo>> {
    try {
      return await noteFiles(at(archiveFolderFor(archive)));
    } catch (failure: unknown) {
      if (!(failure instanceof FolderMissing)) throw failure;
      return new Map();
    }
  }

  /**
   * The names of the archive folders.
   *
   * No archives at all is the ordinary case — only whoever set the app up puts
   * one there — so a missing `Arhiva` is an empty answer rather than a fault.
   * Anything else is a folder that exists and will not open, which is a fault
   * and goes up.
   */
  async function archiveNames(): Promise<string[]> {
    try {
      return (await files.listFolders(at(ARCHIVE_FOLDER))).filter((name) => name !== VERSIONS_FOLDER);
    } catch (failure: unknown) {
      if (!(failure instanceof FolderMissing)) throw failure;
      return [];
    }
  }

  /**
   * Which texts in a folder have copies kept beside them, and how many.
   *
   * One listing of `Verzije/` rather than one probe per text. Probing asked
   * the disk about a folder once for every text in the archive, and for nearly
   * all of them the answer was that it is not there — 572 failed calls out of
   * 592, for a number shown on one line of one preview. The folder itself
   * names every text that has any, so the whole answer is two listings deep.
   *
   * Absence is ordinary in both directions: no `Verzije` at all, and no folder
   * for a text that has never had a copy kept.
   */
  async function copiesKeptIn(versionsFolder: string): Promise<Map<string, number>> {
    let ids: string[];
    try {
      ids = await files.listFolders(at(versionsFolder));
    } catch (failure: unknown) {
      if (!(failure instanceof FolderMissing)) throw failure;
      return new Map();
    }

    const counted = await Promise.all(
      ids.map(async (id): Promise<[string, number]> => [
        id,
        (await filesIn(at(versionsFolder, id))).length,
      ]),
    );
    return new Map(counted);
  }

  async function idsPutAway(): Promise<Set<string>> {
    const found = await filesIn(at(DELETED_FOLDER));
    return new Set(found.map((file) => idOf(nameOf(file.path))));
  }

  return {
    liveIds: async () => new Set((await noteFiles()).keys()),
    putAwayIds: idsPutAway,
    keepLabelledCopy: (id, text, label) => keepVersion(requireNoteId(id), text, label),

    async list(): Promise<Note[]> {
      const notes = await Promise.all([...(await noteFiles())].map(([id, file]) => noteFrom(id, file)));
      for (const note of notes) lastSeen.set(note.id, note.text);
      return notes.sort(newestFirst);
    },

    async listArchives(): Promise<Archive[]> {
      const archives: Archive[] = [];
      for (const name of await archiveNames()) {
        const held = await archivedFiles(name);
        // An archive with nothing in it is a folder, not an archive. Left on
        // disk, because whoever put it there meant to, and left out of here,
        // because a row that opens onto nothing is worse than no row.
        if (held.size > 0) archives.push({ name, texts: held.size });
      }
      return archives.sort((first, second) => first.name.localeCompare(second.name, 'sr'));
    },

    async listArchived(liveTitles: ReadonlySet<string>): Promise<ArchivedNote[]> {
      /*
        All at once, the way `list` and `listDeleted` read. Written as a
        nested loop with an await in it first, which read six hundred files one
        after another: measured against this, 1950ms to 450. A button that does
        nothing for two seconds is a button he presses again.
      */
      const byArchive = await Promise.all(
        (await archiveNames()).map(async (archive): Promise<ArchivedNote[]> => {
          const kept = await copiesKeptIn(`${archiveFolderFor(archive)}/${VERSIONS_FOLDER}`);
          return Promise.all(
            [...(await archivedFiles(archive))].map(async ([id, file]): Promise<ArchivedNote> => {
              const note = await noteFrom(id, file);
              return {
                ...note,
                archive,
                versions: kept.get(id) ?? 0,
                // By title, which is conservative: it misses a text he rewrote
                // the opening of, and it never claims two texts are the same,
                // only that two of them start alike. That is the whole of what
                // he needs to decide whether to bring one in.
                alsoLive: liveTitles.has(note.title),
              };
            }),
          );
        }),
      );
      return byArchive.flat().sort(newestFirst);
    },

    async bringBack(archive: string, id: string): Promise<string> {
      const file = (await archivedFiles(archive)).get(requireNoteId(id));
      if (file === undefined) throw new Error(`No such archived note: ${archive}/${id}`);

      // Under its own name. Nothing in his list is renamed to make room: a name
      // built to be unique meeting itself is rare enough to count on past it.
      const back = unusedName(id, new Set((await noteFiles()).keys()));
      await files.rename(file.path, at(`${back}${EXTENSION}`));

      /*
        Touched on the way in, exactly as a restored text is. Its old time is
        when it was last written on a machine he no longer uses, which would
        file a text he asked for this minute among his 2019s — and the list he
        would go looking in is ordered by time. Now is the honest answer to
        "when did this last change", because bringing it in is a change to it.
      */
      const text = await textOf(at(`${back}${EXTENSION}`));
      if (text !== null) await files.write(at(`${back}${EXTENSION}`), text);

      // Its history comes with it. An archived text is often the only place an
      // early draft survives, and that is the reason to keep archives at all.
      await moveVersions(archivedVersionsFolderFor(archive, id), versionsFolderFor(back));

      return back;
    },

    async listDeleted(): Promise<DeletedNote[]> {
      // Counted, not read: how many there are decides how hard it should be to
      // destroy this, and that question does not need their contents.
      const kept = await copiesKeptIn(`${DELETED_FOLDER}/${VERSIONS_FOLDER}`);
      const notes = await Promise.all(
        [...(await putAwayFiles())].map(async ([id, file]): Promise<DeletedNote> => {
          return { ...(await noteFrom(id, file)), versions: kept.get(id) ?? 0 };
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
      const text = asWritten(await files.read(file.path));
      lastSeen.set(id, text);
      return text;
    },

    async save(id: string | null, text: string): Promise<string | null> {
      const existing = await noteFiles();
      const current = id === null ? undefined : existing.get(requireNoteId(id))?.path;

      // Read at most once, however many of the questions below want it: on a
      // 145KB essay this is the expensive part of a save.
      let asItWas: string | null = null;
      const previousText = async (): Promise<string> => {
        asItWas ??= current === undefined ? '' : asWritten((await textOf(current)) ?? '');
        return asItWas;
      };

      const action = await planSave(id, text, {
        newName: async (written) =>
          unusedName(newNameFor(titleFrom(written), naming.now(), naming.machine), new Set(existing.keys())),
        previousText,
        lastKept: async () => (id === null ? null : newestCopy(id)),
      });

      if (action.kind === 'none') return null;

      // Before the write, and if it fails the write does not happen: this save
      // is about to destroy the only copy, so a version he cannot keep is a
      // reason not to proceed. He sees "not saved" and the next autosave tries
      // again; his text stays on disk in the meantime.
      if (action.snapshot !== undefined) await keepVersion(action.id, action.snapshot);

      // Never written blind: what something else put there is kept first.
      const seen = id === null ? undefined : lastSeen.get(id);
      if (id !== null && seen !== undefined) {
        const onDisk = await previousText();
        if (onDisk !== seen && onDisk !== action.snapshot && !isEmptyText(onDisk)) {
          await keepVersion(id, onDisk, CHANGED_ELSEWHERE);
          log.warn('A text changed on disk behind b-notes; kept what was there before writing', { id });
        }
      }

      await files.write(at(`${action.id}${EXTENSION}`), text);
      lastSeen.set(action.id, text);
      return action.id;
    },

    async moveToDeleted(id: string): Promise<void> {
      const file = (await noteFiles()).get(requireNoteId(id));
      if (file === undefined) return;

      // Null when it cannot be read at all, which is the one case where nothing
      // below should touch what is in it.
      const held = await textOf(file.path);
      const text = held === null ? null : asWritten(held);

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
        const versions = await filesIn(at(versionsFolderFor(id)));
        if (versions.length === 0 && (await files.removeEmptyFile(file.path))) return;
      }

      const kept = text === null ? null : await lastKeptCopy(id, text);

      // Under the name it had. Only another text put away under that very name
      // — the same text deleted on two machines — needs telling apart.
      const name = unusedName(id, await idsPutAway());
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
      const file = (await putAwayFiles()).get(requireNoteId(id));
      if (file === undefined) throw new Error(`No such deleted note: ${id}`);

      // The note first, then what was kept of it. Should this stop halfway, a
      // version left behind is invisible and harmless — nothing can inherit it,
      // since versions for a live note are kept somewhere else entirely — while
      // a note left behind with its versions destroyed would be a row he can
      // still see, emptied of the writing it was standing for.
      await files.removeFile(file.path);

      const folder = putAwayVersionsFolderFor(id);
      for (const version of await filesIn(at(folder))) {
        await files.removeFile(version.path);
      }
      await files.removeEmptyFolder(at(folder));
      await files.removeEmptyFolder(at(DELETED_FOLDER, VERSIONS_FOLDER));
    },

    async keepCopy(id: string, text: string): Promise<string> {
      const note = requireNoteId(id);
      const already = await sameCopy(note, asWritten(text));
      return already ?? keepVersion(note, text);
    },

    async countVersions(id: string): Promise<number> {
      return (await filesIn(at(versionsFolderFor(requireNoteId(id))))).length;
    },

    async listVersions(id: string): Promise<NoteVersion[]> {
      const kept = await filesIn(at(versionsFolderFor(requireNoteId(id))));
      const versions = await Promise.all(
        kept.map(async (file): Promise<NoteVersion> => ({
          id: idOf(nameOf(file.path)),
          // When it was written, which is when it was taken. A rename leaves a
          // file's time alone, so this survives the text being put away and
          // brought back.
          takenAt: file.updatedAt,
          text: asWritten((await textOf(file.path)) ?? ''),
        })),
      );
      // Newest first, by name rather than by time: two taken inside one second
      // share a time, and only their names say which came second.
      return versions.sort((first, second) => (first.id < second.id ? 1 : first.id > second.id ? -1 : 0));
    },

    async restore(id: string): Promise<string> {
      const file = (await putAwayFiles()).get(requireNoteId(id));
      if (file === undefined) throw new Error(`No such deleted note: ${id}`);

      // Back under its own name, which nothing else will have taken — names are
      // unique by construction. Guarded anyway: a text he asked for and did not
      // get is the worse surprise.
      const back = unusedName(id, new Set((await noteFiles()).keys()));
      await files.rename(file.path, at(`${back}${EXTENSION}`));

      // Touched on the way back, for the same reason it was touched on the way
      // out. Its old time is the moment he deleted it, which would be a strange
      // thing for a text in his list to claim — and the date he wrote it was
      // spent then. Now is the honest answer: he has just asked for it back,
      // and that is when it last changed.
      const text = await textOf(at(`${back}${EXTENSION}`));
      if (text !== null) await files.write(at(`${back}${EXTENSION}`), text);

      // The copies come with it and are not spent: throwing away the only other
      // copy at the moment of recovery is the opposite of the point.
      await moveVersions(putAwayVersionsFolderFor(id), versionsFolderFor(back));
      return back;
    },
  };
}
