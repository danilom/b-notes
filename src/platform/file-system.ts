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
  /** Files directly inside `folder`. Subfolders aren't listed. */
  list(folder: string): Promise<FileInfo[]>;
  read(path: string): Promise<string>;
  /** Must not be able to leave a half-written file behind. */
  write(path: string, text: string): Promise<void>;
  /** Creates the destination folder if it doesn't exist yet. */
  rename(from: string, to: string): Promise<void>;
}
