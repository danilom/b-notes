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
  /** Where the log files go. Separable from `appFolder` so they can be put
      somewhere shared, which is the cheapest telemetry available to us. */
  readonly logsFolder: string;
  readonly log: Log;
  /**
   * Opens a folder in whatever the desktop uses to show folders.
   *
   * For the advanced panel alone, which is the one surface in this app that is
   * not written for him. Everywhere else, showing a path is forbidden.
   */
  readonly openFolder: (path: string) => Promise<void>;
  /**
   * Asks for a folder, starting from `from`. Null when nothing was chosen.
   *
   * The host's job because only it has a picker: Electron has the real one, and
   * a browser tab has nothing and has to make do.
   */
  readonly chooseFolder: (from: string) => Promise<string | null>;
  /**
   * Remembers where his writing and our logs should live, from now on.
   *
   * Written where the app can find it before anything else starts, which is why
   * it is the host's to keep rather than something `notes/` could hold: the
   * writing folder cannot be configured from inside the writing folder.
   *
   * Takes effect on the next start. Nothing here moves a single file — pointing
   * the app somewhere else is not the same as taking his writing there, and the
   * one that silently moved six hundred files would be unforgivable.
   */
  readonly rememberFolders: (folders: { writing: string; logs: string }) => Promise<void>;
  /**
   * Starts the app again, so everything is read from wherever it now lives.
   *
   * A reload of the page is not enough in the packaged app: the folders are
   * settled in the main process before a window exists, so a refreshed renderer
   * would be handed the old paths and the log would still be writing where it
   * always was. Only the host knows what starting again means for it.
   */
  readonly restart: () => Promise<void>;
  /**
   * Scales the whole window, exactly as Ctrl+ and Ctrl- do in a browser.
   *
   * A host capability because only the host knows how: the packaged app has
   * Chromium's own zoom, and a plain browser tab has to fake it. Doing it
   * ourselves in CSS would mean re-deriving every padding and border from a
   * factor, and getting a worse result than the engine already gives away.
   *
   * @param factor 1 is unscaled; 1.5 makes everything half again as large.
   */
  readonly setZoom: (factor: number) => void;
}
