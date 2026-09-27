import { type FileSystem, FolderMissing } from '../platform/file-system.ts';
import { EXTENSION, VERSIONS_FOLDER, copyNameFor, idOf, isNoteFile } from '../notes/note-naming.ts';
import { CHANGED_ELSEWHERE } from '../notes/note-store.ts';
import { resophIdOf } from '../notes/resoph-note.ts';

/**
 * Where one text's files are, and what has happened to it along the way.
 *
 * Nothing he sees depends on any of it. It answers "which file is this row,
 * and how did it get there", which is otherwise a matter of reading two
 * folders and knowing the rules that connect them.
 */
export interface Whereabouts {
  /** Still in his Resoph folder; taken over from Resoph into b-notes; or begun in b-notes. */
  origin: 'resoph' | 'copy' | 'own';
  /** Its own file. */
  path: string;
  /** For a copy, the Resoph file it was taken from, which holds the stub as a rule. */
  resophPath: string | null;
  /** Changed behind b-notes' back at least once, which kept a version of it. */
  changedElsewhere: boolean;
  /** A file Dropbox made when two machines changed one at the same time. */
  conflictedCopy: boolean;
}

/** What is read off the two folders, for `whereaboutsOf`. */
export interface WhereaboutsRead {
  /** b-notes' own folder. */
  folder: string;
  /** Every file in his Resoph folder, stubs included. */
  resophTexts: readonly { stem: string; path: string }[];
  /** b-notes' texts in his list. */
  ownIds: ReadonlySet<string>;
  changedElsewhere: ReadonlySet<string>;
}

/** Dropbox's own words, which it puts into the name of the file it could not merge. */
const CONFLICTED = /conflicted copy/i;

/**
 * A copy's name without the number a second one is given when the first name
 * is taken: `Pismo ~K3F9A2 2` is still a copy of the same Resoph file.
 */
const withoutNumber = (id: string): string => id.replace(/ \d+$/, '');

/**
 * The whereabouts of every text, by the id the list knows it by.
 *
 * A text taken over from Resoph is known by its name, which is worked out from
 * the Resoph file's — and only while that file is there: a name cannot be read
 * backwards. Every Resoph file gets an entry; whether it is listed at all, as
 * his writing rather than a stub, is the list's business.
 */
export function whereaboutsOf(read: WhereaboutsRead): Map<string, Whereabouts> {
  const found = new Map<string, Whereabouts>();
  const byCopyName = new Map(read.resophTexts.map((text) => [copyNameFor(text.stem), text]));

  for (const text of read.resophTexts) {
    found.set(resophIdOf(text.stem), {
      origin: 'resoph',
      path: text.path,
      resophPath: null,
      changedElsewhere: false,
      conflictedCopy: CONFLICTED.test(text.stem),
    });
  }

  for (const id of read.ownIds) {
    const resophFile = byCopyName.get(id) ?? byCopyName.get(withoutNumber(id)) ?? null;
    found.set(id, {
      origin: resophFile === null ? 'own' : 'copy',
      path: `${read.folder}/${id}${EXTENSION}`,
      resophPath: resophFile?.path ?? null,
      changedElsewhere: read.changedElsewhere.has(id),
      conflictedCopy: CONFLICTED.test(id),
    });
  }
  return found;
}

const nameOf = (path: string): string => path.split('/').at(-1) ?? path;

/**
 * Reads both folders as they are on disk and says where each text is.
 *
 * From listings, and never from what the files hold: this runs after every
 * change to his list while test mode is on, and his Resoph folder is six
 * hundred texts and thirteen megabytes.
 *
 * @param resophFolder his Resoph folder, or null on a machine that has none.
 */
export async function readWhereabouts(
  files: FileSystem,
  notesFolder: string,
  resophFolder: string | null,
): Promise<Map<string, Whereabouts>> {
  const [resophTexts, own, changedElsewhere] = await Promise.all([
    resophFolder === null ? Promise.resolve([]) : textFiles(files, resophFolder),
    textFiles(files, notesFolder),
    changedBehindItsBack(files, `${notesFolder}/${VERSIONS_FOLDER}`),
  ]);
  return whereaboutsOf({
    folder: notesFolder,
    resophTexts,
    ownIds: new Set(own.map((text) => text.stem)),
    changedElsewhere,
  });
}

/** The texts in a folder, by name and path, or none where the folder is not there yet. */
async function textFiles(files: FileSystem, folder: string): Promise<{ stem: string; path: string }[]> {
  try {
    return (await files.list(folder))
      .filter((file) => isNoteFile(nameOf(file.path)))
      .map((file) => ({ stem: idOf(nameOf(file.path)), path: file.path }));
  } catch (failure: unknown) {
    // Each of these folders comes into being the first time it is used.
    if (!(failure instanceof FolderMissing)) throw failure;
    return [];
  }
}

/** The texts that changed on disk behind b-notes' back, which kept a version of each. */
async function changedBehindItsBack(files: FileSystem, versions: string): Promise<Set<string>> {
  let kept: string[];
  try {
    kept = await files.listFolders(versions);
  } catch (failure: unknown) {
    // Not there until the first version is kept, which is ordinary.
    if (!(failure instanceof FolderMissing)) throw failure;
    return new Set();
  }
  const labelled = new RegExp(` ${CHANGED_ELSEWHERE}( \\(\\d+\\))?$`);
  const found = new Set<string>();
  for (const id of kept) {
    const names = (await textFiles(files, `${versions}/${id}`)).map((text) => text.stem);
    if (names.some((name) => labelled.test(name))) found.add(id);
  }
  return found;
}
