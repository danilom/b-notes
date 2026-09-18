import type { FileSystem } from './file-system.ts';
import type { Log } from './logging.ts';

/**
 * Everything a host provides, in one declaration.
 *
 * The app is handed one of these and reaches for nothing else — no globals, no
 * `window.something`, no direct use of anything a browser and Electron do
 * differently. Adding a capability means adding it here, where both hosts have
 * to answer for it, rather than quietly somewhere only one of them can satisfy.
 *
 * What a note is, and how one is named, saved or put away, is emphatically not
 * in here. That belongs to the app and lives in `notes/`.
 */
export interface Host {
  /** Which host this is, for the log: `electron` or `browser`. */
  readonly name: string;
  readonly files: FileSystem;
  /** Where his texts live. He must never be shown this. */
  readonly writingFolder: string;
  /** Ours: the log, what he had open, how he likes the app set up. */
  readonly appFolder: string;
  readonly log: Log;
}
