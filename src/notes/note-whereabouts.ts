import { EXTENSION, copyNameFor } from './note-naming.ts';
import { resophIdOf } from './resoph-note.ts';

/**
 * Where one text's files are, and what has happened to it along the way.
 *
 * For test mode alone: nothing he sees depends on any of it. It is the answer
 * to "which file is this row, and how did it get there", which is otherwise a
 * matter of reading three folders and knowing the rules that connect them.
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

/** What the library reads off the two folders, for `whereaboutsOf`. */
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
 * The same rules the library lists by, read the other way: a Resoph text with
 * a copy is not a text of its own, and a copy is known by its link or, failing
 * that, by the name every copy of that Resoph file is given.
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
