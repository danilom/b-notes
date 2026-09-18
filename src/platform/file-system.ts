/**
 * The whole of what a platform has to provide: somewhere to keep text files.
 *
 * Deliberately not about notes. Everything that knows what a note is — titles,
 * collisions, what counts as deleted, where put-away text goes — is built on top
 * of this in shared code, so the browser and the installed app cannot diverge.
 * Reading anything else off the machine later goes through here too.
 */
export interface FileInfo {
  /** Path relative to the root, with forward slashes. */
  path: string;
  updatedAt: number;
  bytes: number;
}

/**
 * Folders exist, but there is nothing to create or remove them with: writing to
 * `Obrisano/esej.txt` brings the folder into being, and it stops mattering once
 * nothing is in it. That keeps every caller from having to remember a step, and
 * there is no state to get out of step with what's actually on disk.
 *
 * Add `folders()` when something genuinely needs to enumerate them — version
 * history will — rather than now.
 */
export interface FileSystem {
  /** Files directly inside `folder`, the root by default. Subfolders aren't listed. */
  list(folder?: string): Promise<FileInfo[]>;
  read(path: string): Promise<string>;
  /** Must not be able to leave a half-written file behind. */
  write(path: string, text: string): Promise<void>;
  /** Creates the destination folder if it doesn't exist yet. */
  rename(from: string, to: string): Promise<void>;
}

/**
 * Paths reach here from the renderer, so they are checked before they touch
 * anything. Both implementations use this — a rule enforced on only one side
 * would be no rule at all.
 */
export function isSafePath(candidate: string): boolean {
  if (candidate.length === 0 || candidate.includes('\\')) return false;
  return candidate
    .split('/')
    .every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

export function requireSafePath(candidate: string): string {
  if (!isSafePath(candidate)) throw new Error(`Not a path inside the notes folder: ${candidate}`);
  return candidate;
}
