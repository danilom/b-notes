import { type FileSystem, FolderMissing } from '../platform/file-system.ts';
import {
  CHANGED_IN_BOTH_FOLDER,
  DELETED_FOLDER,
  EXTENSION,
  RESOPH_LINKS_FOLDER,
  VERSIONS_FOLDER,
  copyNameFor,
  idOf,
  isNoteFile,
} from '../notes/note-naming.ts';
import { CHANGED_ELSEWHERE } from '../notes/note-store.ts';
import { resophIdOf } from '../notes/resoph-note.ts';

/**
 * Where one text's files are, and what has happened to it along the way.
 *
 * Nothing he sees depends on any of it. It answers "which file is this row,
 * and how did it get there", which is otherwise a matter of reading three
 * folders and knowing the rules that connect them.
 */
export interface Whereabouts {
  /** Only in his Resoph folder; b-notes' copy of a Resoph text; or begun in b-notes. */
  origin: 'resoph' | 'copy' | 'own';
  /** Its own file. */
  path: string;
  /** For a copy, the name of the Resoph file it was taken from, there or not. */
  resophStem: string | null;
  /** For a copy, that Resoph file, or null where it is no longer there. */
  resophPath: string | null;
  /** A copy known only by its name: the link naming its original was never written. */
  unlinked: boolean;
  /** A copy whose Resoph file is gone — deleted there, or retitled, which Resoph does by writing a new file. */
  resophGone: boolean;
  /** Changed in both Resoph and b-notes, and not yet looked at. */
  changedInBoth: boolean;
  /** Changed behind b-notes' back at least once, which kept a version of it. */
  changedElsewhere: boolean;
  /** A file Dropbox made when two machines changed one at the same time. */
  conflictedCopy: boolean;
}

/** What is read off the two folders, for `whereaboutsOf`. */
export interface WhereaboutsRead {
  /** b-notes' own folder. */
  folder: string;
  /** Every text in his Resoph folder. */
  resophTexts: readonly { stem: string; path: string }[];
  /** b-notes' texts in his list. */
  ownIds: ReadonlySet<string>;
  /** Each copy's link: the copy's name, and the Resoph file it was taken from. */
  links: ReadonlyMap<string, string>;
  /** Every name that means a Resoph text has a copy, and so is not listed itself. */
  taken: ReadonlySet<string>;
  changedInBoth: ReadonlySet<string>;
  changedElsewhere: ReadonlySet<string>;
}

/** Dropbox's own words, which it puts into the name of the file it could not merge. */
const CONFLICTED = /conflicted copy/i;

/**
 * The whereabouts of every text in his list, by the id the list knows it by.
 *
 * The library's rules read the other way: a Resoph text with a copy is not a
 * text of its own, and a copy is known by its link or, failing that, by the
 * name every copy of that Resoph file is given.
 */
export function whereaboutsOf(read: WhereaboutsRead): Map<string, Whereabouts> {
  const found = new Map<string, Whereabouts>();
  const byCopyName = new Map(read.resophTexts.map((text) => [copyNameFor(text.stem), text]));
  const resophPaths = new Map(read.resophTexts.map((text) => [text.stem, text.path]));
  const plain = { unlinked: false, resophGone: false, changedInBoth: false, changedElsewhere: false };

  for (const text of read.resophTexts) {
    if (read.taken.has(copyNameFor(text.stem))) continue;
    found.set(resophIdOf(text.stem), {
      ...plain,
      origin: 'resoph',
      path: text.path,
      resophStem: null,
      resophPath: null,
      conflictedCopy: CONFLICTED.test(text.stem),
    });
  }

  for (const id of read.ownIds) {
    const stem = read.links.get(id) ?? byCopyName.get(id)?.stem ?? null;
    const resophPath = stem === null ? null : (resophPaths.get(stem) ?? null);
    found.set(id, {
      origin: stem === null ? 'own' : 'copy',
      path: `${read.folder}/${id}${EXTENSION}`,
      resophStem: stem,
      resophPath,
      unlinked: stem !== null && !read.links.has(id),
      resophGone: stem !== null && resophPath === null,
      changedInBoth: read.changedInBoth.has(id),
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
 * From listings, and never from what the files hold, apart from each copy's
 * one-line link: this runs after every change to his list while test mode is
 * on, and his Resoph folder is six hundred texts and thirteen megabytes.
 *
 * @param resophFolder his Resoph folder, or null on a machine that has none.
 */
export async function readWhereabouts(
  files: FileSystem,
  notesFolder: string,
  resophFolder: string | null,
): Promise<Map<string, Whereabouts>> {
  const [resophTexts, ownIds, putAway, links, changedInBoth, changedElsewhere] = await Promise.all([
    resophFolder === null ? Promise.resolve([]) : textFiles(files, resophFolder),
    namesIn(files, notesFolder),
    namesIn(files, `${notesFolder}/${DELETED_FOLDER}`),
    linksIn(files, `${notesFolder}/${RESOPH_LINKS_FOLDER}`),
    namesIn(files, `${notesFolder}/${CHANGED_IN_BOTH_FOLDER}`),
    changedBehindItsBack(files, `${notesFolder}/${VERSIONS_FOLDER}`),
  ]);
  return whereaboutsOf({
    folder: notesFolder,
    resophTexts,
    ownIds,
    links,
    taken: new Set([...links.keys(), ...ownIds, ...putAway]),
    changedInBoth,
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

async function namesIn(files: FileSystem, folder: string): Promise<Set<string>> {
  return new Set((await textFiles(files, folder)).map((text) => text.stem));
}

/** Each copy's link: the copy's name, and the Resoph file the link names. */
async function linksIn(files: FileSystem, folder: string): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  for (const link of await textFiles(files, folder)) {
    links.set(link.stem, (await files.read(link.path)).trim());
  }
  return links;
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
    if ([...(await namesIn(files, `${versions}/${id}`))].some((name) => labelled.test(name))) found.add(id);
  }
  return found;
}
