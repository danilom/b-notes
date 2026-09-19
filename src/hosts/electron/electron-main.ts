import { BrowserWindow, Menu, app, ipcMain, screen } from 'electron';
import path from 'node:path';

import { BUILD_STAMP } from '../../platform/build-info.ts';
import { LOG_LEVELS, createFileLogger } from './log-file.ts';
import { createFileSystem } from './disk-file-system.ts';
import { startUpdateChecks } from './app-updates.ts';
import { pulledBackOnScreen } from './window-bounds.ts';

// The machines this runs on have old integrated GPUs, where acceleration causes
// more rendering glitches than it prevents.
app.disableHardwareAcceleration();

/**
 * No menu bar.
 *
 * Electron installs a default one when we don't, and it is a row of things he
 * must never reach: Toggle Developer Tools, which fills half his screen with
 * something that looks like the app breaking; Force Reload; and full screen,
 * which hides the window, and a window he cannot see is work he believes is
 * gone. None of it is worth a menu holding nothing of ours.
 *
 * Ctrl+C and the rest of the editing shortcuts are Chromium's own and keep
 * working inside a textarea without any menu item to back them.
 */
Menu.setApplicationMenu(null);

const runMode = app.isPackaged ? 'installed' : 'dev';

// `userData` rather than `getPath('logs')` because it resolves before the app is
// ready, and startup is exactly when we most need somewhere to write. The log,
// what he had open and how he likes the app set up all live here together — per
// machine, never synced, and all of it safe to delete.
const appFolder = app.getPath('userData');
const log = createFileLogger(path.join(appFolder, 'logs'), runMode);
const rendererLog = log.scoped('renderer');

// Nothing here reaches a terminal: Electron detaches stdout on Windows, so an
// unhandled failure is invisible unless it lands in the log file. Neither of
// these quits — he may have text on screen, and staying up beats a tidy exit.
process.on('uncaughtException', (error) => log.error('Uncaught exception', error));
process.on('unhandledRejection', (reason) => log.error('Unhandled rejection', reason));

// Where his writing lives is not settled: it belongs in the Dropbox folder,
// which needs detecting at first run. Documents keeps this runnable until then.
// Forward slashes throughout, which is what the filesystem contract expects and
// which Windows accepts perfectly well.
const folders = {
  writing: path.join(app.getPath('documents'), 'b-notes').replaceAll('\\', '/'),
  app: appFolder.replaceAll('\\', '/'),
};
const files = createFileSystem();

function asString(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string`);
  return value;
}

/** A file that isn't there yet. Ordinary, and not the same thing as a failure. */
function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}

function handle(channel: string, handler: (args: unknown[]) => Promise<unknown>): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    try {
      return await handler(args);
    } catch (error) {
      // Still thrown to the caller, which is the only side that knows whether
      // an absent file matters. Only the log level is softened: settings and
      // session are absent on every first run, and three stack traces at ERROR
      // teach whoever reads this log to skim past exactly the thing it exists
      // to show them.
      if (isMissingFile(error)) log.info(`${channel}: nothing there yet`, { args });
      else log.error(`${channel} failed`, error);
      throw error;
    }
  });
}

// The bridge offers a filesystem and nothing more. What a note is, and how one
// is named, saved or put away, is the app's business and lives in shared code —
// this process has no idea any of it exists.
handle('app:folders', async () => folders);
handle('files:list', (args) => files.list(asString(args[0], 'folder')));
handle('files:read', (args) => files.read(asString(args[0], 'path')));
handle('files:write', (args) => files.write(asString(args[0], 'path'), asString(args[1], 'text')));
handle('files:rename', (args) => files.rename(asString(args[0], 'from'), asString(args[1], 'to')));
handle('files:removeEmptyFolder', (args) => files.removeEmptyFolder(asString(args[0], 'folder')));
handle('files:removeEmptyFile', (args) => files.removeEmptyFile(asString(args[0], 'path')));
handle('files:removeFile', (args) => files.removeFile(asString(args[0], 'path')));

ipcMain.on('log:write', (_event, level: unknown, message: unknown, detail: unknown) => {
  // Coerced rather than validated: a malformed log call should still leave a
  // trace, since it means something upstream is already wrong.
  const chosen = LOG_LEVELS.find((candidate) => candidate === level) ?? 'info';
  rendererLog[chosen](typeof message === 'string' ? message : String(message), detail);
});

/**
 * The smallest he is allowed to make the window.
 *
 * Off his screen rather than a fixed number of pixels, because the same count
 * is a comfortable window on one of his machines and nearly all of the screen
 * on another.
 *
 * Three quarters of the work area: near enough to full that the list and the
 * writing both keep the room they were designed for, and a window he has
 * dragged smaller is still plainly this app rather than a sliver. The floor
 * stops a small screen from setting a minimum the layout cannot fit into; the
 * cap stops a very large one from insisting on a window he could never make
 * smaller at all.
 */
const SMALLEST_SHARE = 0.75;

function smallestWindow(): { width: number; height: number } {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  return {
    width: Math.round(Math.min(1600, Math.max(760, width * SMALLEST_SHARE))),
    height: Math.round(Math.min(1000, Math.max(500, height * SMALLEST_SHARE))),
  };
}

let mainWindow: BrowserWindow | null = null;

/** Long enough that this happens after he has let go, not while he is dragging. */
const SETTLED_MS = 250;

/**
 * Brings the window back if he drags it off the desk.
 *
 * Only after the move has finished and settled, and only when the window has
 * genuinely gone — so it never argues with him mid-drag about where he is
 * putting it, and does nothing at all in the ordinary case.
 *
 * Deliberately no window styles touched. Holding the window in place by taking
 * the maximise button away was tried and reverted, because changing how Windows
 * is allowed to size a window breaks in ways that only appear after a minimise
 * or a snap. Moving a window that has already been moved cannot do that.
 *
 * Nothing remembers where the window was between runs, so the worst this can
 * fail to catch is undone by closing the app and opening it again — which is
 * his answer to everything, and the reason this is a comfort rather than a
 * necessity.
 */
function keepWindowReachable(window: BrowserWindow): void {
  let settling: ReturnType<typeof setTimeout> | undefined;

  window.on('moved', () => {
    clearTimeout(settling);
    settling = setTimeout(() => {
      if (window.isDestroyed() || window.isMinimized() || window.isMaximized()) return;

      const bounds = window.getBounds();
      // The display it is mostly on, so a second monitor is somewhere it may
      // live rather than somewhere it gets dragged back from.
      const back = pulledBackOnScreen(bounds, screen.getDisplayMatching(bounds).workArea);
      if (back === null) return;

      window.setBounds(back);
      log.info('Brought the window back onto the screen', { from: bounds, to: back });
    }, SETTLED_MS);
  });
}

async function createWindow(): Promise<BrowserWindow> {
  const smallest = smallestWindow();
  const window = new BrowserWindow({
    // The size he gets if he un-maximises, and the floor under any resize.
    width: 1100,
    height: 800,
    minWidth: smallest.width,
    minHeight: smallest.height,
    show: false,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
    },
  });

  /*
    Starts maximised, and that is as far as it goes.

    Holding it there was tried and reverted. Disabling the maximise button makes
    Windows size the window to exactly the work area rather than overhanging it
    by the border width, so the borders stay on screen as a pale strip above the
    taskbar; maximising before removing the button fixes that on startup but not
    after a minimise, restore or snap, each of which re-maximises under the
    style that is current by then. A minimum size does the thing that actually
    mattered — he cannot shrink it to a sliver — without any of that.
  */
  window.maximize();

  keepWindowReachable(window);

  mainWindow = window;
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });

  // Showing only once painted avoids the white flash, which is slow and ugly on
  // an old disk. It also means a failed load leaves no window at all, so surface
  // the failure rather than hanging invisibly.
  window.once('ready-to-show', () => window.show());
  window.webContents.on('did-fail-load', (_event, code, description, url) => {
    log.error('Renderer failed to load', { url, description, code });
    window.destroy();
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    log.error('Renderer process gone', details);
  });

  await window.loadFile(path.join(import.meta.dirname, 'index.html'));
  return window;
}

app.on('window-all-closed', () => {
  log.info('All windows closed, quitting');
  app.quit();
});

/**
 * Deliberately not top-level `await`. This entry point is an ES module, and
 * Electron waits for it to finish evaluating before emitting `ready` — so
 * awaiting `whenReady()` at the top level deadlocks and no window ever opens.
 */
async function start(): Promise<void> {
  log.info('Starting', {
    mode: runMode,
    version: app.getVersion(),
    build: BUILD_STAMP,
    electron: process.versions.electron,
    writing: folders.writing,
  });
  await app.whenReady();
  const window = await createWindow();
  // Bounds against the work area, because "a window he cannot see" covers a
  // window that is the wrong size as well as one that is hidden.
  log.info('Window open', {
    maximized: window.isMaximized(),
    bounds: window.getBounds(),
    minimum: window.getMinimumSize(),
    workArea: screen.getPrimaryDisplay().workArea,
    scale: screen.getPrimaryDisplay().scaleFactor,
  });
  startUpdateChecks(log);
}

/**
 * Only ever one instance.
 *
 * When nothing appears to happen he clicks the icon again, and two copies
 * editing the same folder would race each other's autosaves — the conflicted
 * copy problem, without even needing a second machine.
 */
if (app.requestSingleInstanceLock()) {
  app.on('second-instance', () => {
    log.info('Another instance was launched; focusing the window already open');
    if (mainWindow === null) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  start().catch((error: unknown) => {
    log.error('Failed to start', error);
    app.quit();
  });
} else {
  log.info('Another instance already holds the lock; quitting this one');
  app.quit();
}
