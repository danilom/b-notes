import type { FileSystem } from './file-system.ts';
import type { Log } from './logging.ts';

/** What a copy of the app is: installed, built to work on, or the mock. */
export type RunMode = 'installed' | 'dev' | 'browser';

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
  /**
   * Which of the three ways this copy is running.
   *
   * `installed` is what he has; the other two are somebody working on it. The
   * distinction is not cosmetic — a browser copy is reading pretend files, so
   * anything done to it is done to nothing, and a dev build is reading his real
   * writing while being changed underneath. Both want saying out loud, and only
   * where they can be seen by the person they concern.
   */
  readonly runMode: RunMode;
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
   * Puts text on the clipboard.
   *
   * The host's job because only a host has one: Electron hands the renderer
   * the real system clipboard, and a browser tab has the one the page is
   * allowed to touch, which needs a gesture behind it and a secure page.
   * Neither is anything `ui/` should know about.
   *
   * Rejects rather than reporting false. Nothing on screen changes when a copy
   * works, so nothing changes when it fails either — which makes this the one
   * operation in the app where a silent failure is completely invisible, and
   * the caller has to be made to deal with it.
   */
  readonly copyToClipboard: (text: string) => Promise<void>;
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
   *
   * Looks out of place, and here is why it is not. The app could write this
   * file itself: it knows `appFolder` and it has `files.write`, which is
   * exactly how `session.json` and `settings.json` are kept. The difference is
   * who reads it. This one is read by the main process *before a window
   * exists*, because one of the things it decides is where the log goes — so
   * the shape belongs to that process, and the interface cannot import it,
   * since nothing in `ui/` may reach into `hosts/`. Written from both sides it
   * would be one rule in two places, and the drift would be silent: the reader
   * treats anything it does not recognise as "nothing chosen", so a renamed key
   * would not fail, it would simply never take effect.
   *
   * There is a second reason, weaker but real. The host hands over folders
   * already settled; the app never works them out. Asking for different ones is
   * therefore asking the host to be configured differently rather than writing
   * a file — which is why this comes paired with `restart` below, and why the
   * logs folder cannot take effect without it.
   */
  readonly rememberFolders: (folders: { writing: string; logs: string }) => Promise<void>;
  /**
   * Says what to do before the window goes, and is given the chance to finish.
   *
   * Autosave runs 800ms after he stops typing, so anything typed since his last
   * pause that long exists only in the editor — and closing the window was the
   * one way out of the app that threw it away. Not a small amount: the timer is
   * pushed back by every keystroke, so a sentence typed without a gap is a
   * sentence at risk.
   *
   * The host's job because only a host knows what closing means. Electron holds
   * the window open until this settles; a browser tab has `pagehide` and no way
   * to wait, which is why the interface must ask for the flush rather than be
   * told the answer afterwards.
   */
  readonly onBeforeClose: (finish: () => Promise<void>) => void;
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
