/**
 * Somewhere to keep text files. The whole of what a platform has to provide,
 * along with `Log`.
 *
 * Deliberately not about notes: everything that knows what a note is — titles,
 * collisions, what counts as deleted — is built on top of this in `notes/`, so
 * the browser and the installed app cannot diverge.
 *
 * Paths reach anywhere the process can. There is no boundary being defended
 * here: it's his machine, his files, no network and no untrusted content. What
 * *is* checked is that a note id is a bare name, and that belongs in `notes/`
 * where ids are made. Migration will want to read from wherever his old files
 * happen to live, so a rooted filesystem would only need unrooting later.
 *
 * Paths are always forward-slash strings, whatever the platform writes on disk.
 */
/**
 * Nothing is there. An answer, not a fault — but its own answer.
 *
 * The one distinction this contract exists to keep. A folder that is not there
 * used to come back as an empty one, so "he has written nothing" and "his
 * writing is unreachable" arrived identically, and the app said the first when
 * it meant the second. Callers for whom absence is ordinary — the versions
 * folder before a copy is kept, the deleted folder before anything is thrown
 * away — catch this and nothing else, which is what makes everything they do
 * not catch visible.
 */
export class FolderMissing extends Error {
  // Written out rather than declared in the constructor: parameter properties
  // are one of the two things `erasableSyntaxOnly` forbids, and that flag is
  // what lets `node --test` run these sources with no build step.
  readonly folder: string;

  constructor(folder: string) {
    super(`No such folder: ${folder}`);
    this.name = 'FolderMissing';
    this.folder = folder;
  }
}

/** The same, for a file. Thrown where a read finds nothing to read. */
export class FileMissing extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`No such file: ${path}`);
    this.name = 'FileMissing';
    this.path = path;
  }
}

export interface FileInfo {
  path: string;
  updatedAt: number;
  bytes: number;
}

export interface FileSystem {
  /**
   * Files directly inside `folder`. Subfolders aren't listed.
   *
   * Throws `FolderMissing` where there is no such folder, and does not create
   * one — asking what is somewhere must not bring it into being. It used to
   * answer with an empty list instead, which conflated the folder we have not
   * made yet with the folder holding six hundred essays that has gone, and the
   * app duly told him he had written nothing.
   */
  list(folder: string): Promise<FileInfo[]>;
  /**
   * The names of the folders directly inside `folder`, and nothing else.
   *
   * For the one place the app keeps writing in folders it did not name:
   * `Arhiva/`, where each import gets a folder of its own. Names rather than
   * paths, because what is wanted is what the folder is called — it is the
   * only label an archive has.
   *
   * Throws `FolderMissing` on the same terms as `list`, for the same reason:
   * an archive folder that has gone is not an archive folder that is empty.
   */
  listFolders(folder: string): Promise<string[]>;
  /**
   * Whether a folder is there and can be looked in.
   *
   * `list` deliberately cannot answer this — a folder that isn't there is empty
   * rather than an error, which is right for the ones we make on demand and
   * useless for the one holding his writing. Asked directly here, and only
   * where the answer is the point: the advanced panel, saying whether a path
   * someone typed is a real place.
   *
   * False covers unreachable as well as absent. They are different problems and
   * this cannot tell them apart, but for the one question it is asked — is this
   * usable — they have the same answer.
   */
  folderExists(folder: string): Promise<boolean>;
  /** Throws `FileMissing` where there is no such file. */
  read(path: string): Promise<string>;
  /** Must not be able to leave a half-written file behind. */
  write(path: string, text: string): Promise<void>;
  /** Creates the destination folder if it doesn't exist yet. */
  rename(from: string, to: string): Promise<void>;
  /**
   * Tidies away a folder we made and no longer need.
   *
   * Cannot destroy anything he wrote, by construction: a folder with a file in
   * it is left alone rather than emptied. Nor can it fail whatever it is
   * tidying up after — a folder that won't go is an untidy folder and nothing
   * worse, so this never throws.
   */
  removeEmptyFolder(folder: string): Promise<void>;
  /**
   * Removes a file, if there is nothing written in it, and says whether it did.
   *
   * The only thing in the app that can destroy a file, and by construction it
   * cannot destroy any of his writing: anything but whitespace and the file is
   * left alone. It reports rather than throws so that every way of failing —
   * the file has something in it, the disk refuses, it is open elsewhere — ends
   * at the same safe place, which is the caller keeping it instead.
   */
  removeEmptyFile(path: string): Promise<boolean>;
  /**
   * Removes a file, whatever is in it.
   *
   * The one capability in the app that can destroy his writing, and it exists
   * for the one command that is supposed to. Unlike the two above it, this
   * throws when it fails: those are tidying, where failing quietly costs
   * nothing, and this is the operation itself.
   */
  removeFile(path: string): Promise<void>;
}
