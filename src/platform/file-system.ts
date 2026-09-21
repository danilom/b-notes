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
export interface FileInfo {
  path: string;
  updatedAt: number;
  bytes: number;
}

export interface FileSystem {
  /**
   * Files directly inside `folder`. Subfolders aren't listed, and a folder that
   * isn't there is empty rather than an error — asking what is somewhere must
   * not bring it into being, or every question leaves a folder behind.
   */
  list(folder: string): Promise<FileInfo[]>;
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
