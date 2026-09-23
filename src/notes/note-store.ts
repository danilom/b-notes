import {
  type FileInfo,
  type FileSystem,
  FileMissing,
  FolderMissing,
} from '../platform/file-system.ts';
import { type Log, describeError } from '../platform/logging.ts';
import {
  baseOf,
  DELETED_FOLDER,
  EXTENSION,
  idOf,
  isConflictedCopy,
  isConvertibleNoteFile,
  type Renaming,
  ARCHIVE_FOLDER,
  archiveFolderFor,
  archivedVersionsFolderFor,
  isNoteFile,
  baseGroupOf,
  claimName,
  nextFreeId,
  settleGroup,
  putAwayVersionsFolderFor,
  requireNoteId,
  VERSIONS_FOLDER,
  versionName,
  versionsFolderFor,
} from './note-naming.ts';
import { deletedIdFor, planSave } from './note-saving.ts';
import { toSearchable } from '../language/diacritics.ts';
import { titleFrom } from './note-title.ts';
import {
  type Archive,
  type ArchivedNote,
  type Converted,
  type DeletedNote,
  type Note,
  type NoteStore,
  type NoteVersion,
  isEmptyText,
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
export function createNoteStore(files: FileSystem, folder: string, log: Log): NoteStore {
  const at = (...parts: string[]): string => [folder, ...parts].join('/');

  /**
   * What is in a folder we may never have made.
   *
   * `Verzije/` and `Obrisano/` come into being the first time they are used, so
   * asking about one that is not there yet is an ordinary question with an
   * empty answer.
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
      // Only the folder we have not made yet. `Verzije/` and `Obrisano/` come
      // into being the first time they are used, so asking about one before
      // then is an ordinary question with an empty answer — and nothing else
      // is, which is why everything else goes up to somebody who can say so.
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
    for (const file of await files.list(from)) {
      const name = nameOf(file.path);
      if (!isNoteFile(name) || isConflictedCopy(name)) continue;
      byId.set(idOf(name), file);
    }
    return byId;
  }

  /**
   * The same, for the folder of texts he has put away.
   *
   * That one comes into being the first time he deletes something, so not being
   * there is an ordinary answer where for the writing folder it is the alarm.
   */
  async function putAwayFiles(): Promise<Map<string, FileInfo>> {
    try {
      return await noteFiles(at(DELETED_FOLDER));
    } catch (failure: unknown) {
      if (!(failure instanceof FolderMissing)) throw failure;
      return new Map();
    }
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
  async function keepVersion(id: string, text: string): Promise<string> {
    const folder = versionsFolderFor(id);
    const taken = new Set((await filesIn(at(folder))).map((file) => idOf(nameOf(file.path))));
    const name = nextFreeId(versionName(new Date()), null, taken);
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

  /** A text and the copies kept of it move together, or neither moves. */
  async function renameNote(from: string, to: string): Promise<void> {
    await moveVersions(versionsFolderFor(from), versionsFolderFor(to));
    await files.rename(at(`${from}${EXTENSION}`), at(`${to}${EXTENSION}`));
  }

  /** The same, for a text that has been put away. Obrisano numbers its own. */
  async function renamePutAway(from: string, to: string): Promise<void> {
    await moveVersions(putAwayVersionsFolderFor(from), putAwayVersionsFolderFor(to));
    await files.rename(
      at(DELETED_FOLDER, `${from}${EXTENSION}`),
      at(DELETED_FOLDER, `${to}${EXTENSION}`),
    );
  }

  type Move = (from: string, to: string) => Promise<void>;

  /**
   * Moves an older text out of the bare name, so that neither of two texts
   * reading the same is left unnumbered.
   *
   * Always after his own text has landed, and never able to fail the save that
   * asked for it. This is housekeeping on a second file — one he is not in and
   * did not touch — while the writing that prompted it is already on disk. A
   * failure leaves `Pismo` beside `Pismo (2)`, which costs a number in the list
   * and loses nothing, so it is logged and the save stands. The next settle of
   * that name puts it right.
   */
  async function makeRoom(displaced: Renaming | null | undefined, move: Move = renameNote): Promise<boolean> {
    if (displaced === undefined || displaced === null) return false;
    try {
      await move(displaced.from, displaced.to);
      log.info('Numbered an older text so a new one of the same name could be told apart', displaced);
      return true;
    } catch (failure: unknown) {
      log.warn('Could not number an older text of the same name', {
        ...displaced,
        failure: describeError(failure),
      });
      return false;
    }
  }

  /**
   * Puts one group of same-named texts back in order, wherever they live.
   *
   * Housekeeping, like `makeRoom`, and held to the same rule: it runs after
   * whatever he asked for has already happened, and a failure is reported
   * rather than thrown. Whoever calls this has finished their work.
   */
  async function settleIn(base: string, ids: () => Promise<ReadonlySet<string>>, move: Move): Promise<void> {
    try {
      const needed = settleGroup(base, await ids());
      if (needed === null) return;
      await move(needed.from, needed.to);
      log.info('Settled the numbers on texts sharing a name', needed);
    } catch (failure: unknown) {
      log.warn('Could not settle the numbers on texts sharing a name', {
        base,
        failure: describeError(failure),
      });
    }
  }

  const liveIds = async (): Promise<ReadonlySet<string>> => new Set((await noteFiles()).keys());
  const settle = (base: string): Promise<void> => settleIn(base, liveIds, renameNote);
  const settlePutAway = (base: string): Promise<void> => settleIn(base, idsPutAway, renamePutAway);

  /**
   * Every group in one folder, from a single listing.
   *
   * One listing rather than one per group: at six hundred texts that is six
   * hundred directory reads against one. Safe to plan from a snapshot because
   * a group's rename only ever lands inside that same group, so no two of
   * these can be planning the same name.
   */
  async function settleEvery(ids: ReadonlySet<string>, move: Move): Promise<void> {
    for (const base of new Set([...ids].map(baseGroupOf))) {
      const needed = settleGroup(base, ids);
      if (needed === null) continue;
      try {
        await move(needed.from, needed.to);
        log.info('Settled the numbers on texts sharing a name', needed);
      } catch (failure: unknown) {
        log.warn('Could not settle the numbers on texts sharing a name', {
          base,
          failure: describeError(failure),
        });
      }
    }
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

  /** The same rename, for a text in one archive. */
  const renameArchived =
    (archive: string) =>
    async (from: string, to: string): Promise<void> => {
      await moveVersions(
        archivedVersionsFolderFor(archive, from),
        archivedVersionsFolderFor(archive, to),
      );
      await files.rename(
        at(archiveFolderFor(archive), `${from}${EXTENSION}`),
        at(archiveFolderFor(archive), `${to}${EXTENSION}`),
      );
    };

  const settleArchived = (archive: string, base: string): Promise<void> =>
    settleIn(
      base,
      async () => new Set((await archivedFiles(archive)).keys()),
      renameArchived(archive),
    );

  async function idsPutAway(): Promise<Set<string>> {
    const found = await filesIn(at(DELETED_FOLDER));
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
    async convertToPlainText(): Promise<Converted> {
      const all = await files.list(folder);
      const taken = new Set(
        all.filter((file) => isNoteFile(nameOf(file.path))).map((file) => idOf(nameOf(file.path))),
      );

      let converted = 0;
      const refused: Converted['refused'] = [];

      for (const file of all) {
        const name = nameOf(file.path);
        if (!isConvertibleNoteFile(name) || isConflictedCopy(name)) continue;

        // `baseOf` rather than `idOf`: a file that arrives already carrying
        // our suffix — and about twenty of his do, from Simplenote — would
        // otherwise be the base for another one on the next clash.
        const taking = claimName(baseOf(name), null, taken);
        const id = taking.id;
        try {
          await files.rename(file.path, at(`${id}${EXTENSION}`));
          taken.add(id);
          converted += 1;
          // Only once it has actually moved. A name still on disk that this
          // believed was free would be displaced a second time by the next
          // file, against a file that is no longer there.
          if (taking.displaced !== null && (await makeRoom(taking.displaced))) {
            taken.delete(taking.displaced.from);
            taken.add(taking.displaced.to);
          }
        } catch (failure: unknown) {
          // One file held open elsewhere shouldn't stop the rest converting —
          // but why it was refused goes with it. Held open by Dropbox, already
          // gone, and refused by Windows are three different problems, and the
          // name alone makes them one.
          refused.push({ name, failure: describeError(failure) });
        }
      }

      return { converted, refused };
    },

    async settleNames(): Promise<void> {
      await settleEvery(await liveIds(), renameNote);
      await settleEvery(await idsPutAway(), renamePutAway);
    },

    async list(): Promise<Note[]> {
      const notes = await Promise.all([...(await noteFiles())].map(([id, file]) => noteFrom(id, file)));
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
      const found: ArchivedNote[] = [];
      for (const archive of await archiveNames()) {
        for (const [id, file] of await archivedFiles(archive)) {
          const note = await noteFrom(id, file);
          const kept = await filesIn(at(archivedVersionsFolderFor(archive, id)));
          found.push({
            ...note,
            archive,
            versions: kept.length,
            // By title, which is conservative: it misses a text he rewrote the
            // opening of, and it never claims two texts are the same, only
            // that two of them start alike. That is the whole of what he needs
            // to decide whether to bring one in.
            alsoLive: liveTitles.has(note.title),
          });
        }
      }
      return found.sort(newestFirst);
    },

    async bringBack(archive: string, id: string): Promise<string> {
      const file = (await archivedFiles(archive)).get(requireNoteId(id));
      if (file === undefined) throw new Error(`No such archived note: ${archive}/${id}`);

      // Claimed in his list, by the rule everything there is named by — which
      // may mean numbering a text already holding the name.
      const taking = claimName(baseOf(id), null, new Set((await noteFiles()).keys()));
      const back = taking.id;
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

      await makeRoom(taking.displaced);
      // The archive is one text lighter under that name.
      await settleArchived(archive, baseGroupOf(id));
      return back;
    },

    async listDeleted(): Promise<DeletedNote[]> {
      const notes = await Promise.all(
        [...(await putAwayFiles())].map(async ([id, file]): Promise<DeletedNote> => {
          // Counted, not read: how many there are decides how hard it should be
          // to destroy this, and that question does not need their contents.
          const kept = await filesIn(at(putAwayVersionsFolderFor(id)));
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
        asItWas ??= current === undefined ? '' : asWritten((await textOf(current)) ?? '');
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
      //
      // Under the name the note still has, so that a rename below carries it
      // across with every other copy rather than leaving today's behind.
      if (action.snapshot !== undefined) await keepVersion(action.id, action.snapshot);

      await files.write(at(`${action.id}${EXTENSION}`), text);
      if (action.kind === 'write') {
        await makeRoom(action.displaced);
        return action.id;
      }

      /*
        His copies move with the text they are copies of. `Verzije/` is named
        after the note, so a retitle that left the folder behind orphaned every
        copy he had — the files stayed on disk and nothing in the app could
        reach them again.

        Before the file is renamed rather than after. Moving them afterwards
        would put a failure between the rename and the id this returns, leaving
        his text under a name the app does not believe in — the one arrangement
        here that nothing recovers from. Done first, a failure leaves everything
        where it stood and the next autosave plans the same rename and tries
        again.
      */
      await renameNote(action.id, action.to);
      await makeRoom(action.displaced);
      // It has just left a group, which may now be down to its last text — and
      // a lone text carries no number.
      await settle(baseGroupOf(action.id));
      return action.to;
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

      const filing = deletedIdFor(id, await idsPutAway());
      const name = filing.id;
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

      // Obrisano numbers its own by the same rule, and his list has one text
      // fewer under the name this one was using.
      await makeRoom(filing.displaced, renamePutAway);
      await settle(baseGroupOf(id));
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

      // Obrisano is one text lighter under this name, and may be down to its
      // last — which carries no number.
      await settlePutAway(baseGroupOf(id));
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

      // He may have written something new under the same opening words while
      // this one was away. It comes back as "Naslov (1)" rather than refusing,
      // because a text he asked for and did not get is the worse surprise.
      const taking = claimName(baseOf(id), null, new Set((await noteFiles()).keys()));
      const back = taking.id;
      await files.rename(file.path, at(`${back}${EXTENSION}`));
      // After it is back, for the same reason a save displaces after its write:
      // the text he asked for must not depend on a second file being tidied.
      await makeRoom(taking.displaced);

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

      // And Obrisano is one text lighter under the name this one was filed as.
      await settlePutAway(baseGroupOf(id));
      return back;
    },
  };
}
