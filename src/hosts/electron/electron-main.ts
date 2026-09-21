import { BrowserWindow, Menu, app, dialog, ipcMain, screen, shell } from 'electron';
import path from 'node:path';

import { BUILD_STAMP } from '../../platform/build-info.ts';
import { LOG_LEVELS, createFileLogger } from './log-file.ts';
import { createFileSystem } from './disk-file-system.ts';
import { readChosenFolders, whereToOpen, writeChosenFolders } from './chosen-folders.ts';
import { startUpdateChecks } from './app-updates.ts';
import { type Rect, deskAround, keptOnTheDesk } from './window-bounds.ts';

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

// Read before the log exists, because one of the things it decides is where the
// log goes. Anything wrong with the file reads as "nothing was chosen", which
// starts the app in its default places rather than not at all.
const chosen = readChosenFolders(appFolder);
const log = createFileLogger(chosen.logs ?? path.join(appFolder, 'logs'), runMode);
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
const asPath = (value: string): string => value.replaceAll('\\', '/');

const folders = {
  // The renderer cannot ask whether this was packaged; only this process can.
  mode: runMode,
  writing: chosen.writing ?? asPath(path.join(app.getPath('documents'), 'b-notes')),
  app: asPath(appFolder),
  logs: chosen.logs ?? asPath(path.join(appFolder, 'logs')),
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

/*
  The advanced panel's three, and the only place in the app allowed to know a
  path exists. Nothing here moves a file: pointing the app at another folder is
  not the same as taking his writing there, and the version that quietly moved
  six hundred files would be the worst bug this app could have.
*/
handle('app:openFolder', async (args) => {
  const failure = await shell.openPath(asString(args[0], 'path'));
  // `openPath` reports by returning a message rather than by throwing.
  if (failure.length > 0) throw new Error(failure);
});

handle('app:chooseFolder', async (args) => {
  const chose = await dialog.showOpenDialog({
    // Not the wanted folder as it stands: it is spelled with forward slashes,
    // which this dialog alone among Windows does not take, and it may not exist
    // yet. Either one makes it open wherever it likes instead.
    defaultPath: whereToOpen(asString(args[0], 'from')),
    properties: ['openDirectory', 'createDirectory'],
  });
  // Back into the spelling the rest of the app uses.
  return chose.canceled ? null : asPath(chose.filePaths[0] ?? '') || null;
});

handle('app:rememberFolders', async (args) => {
  const next = args[0];
  if (typeof next !== 'object' || next === null) throw new TypeError('folders must be an object');
  const held = next as Record<string, unknown>;
  writeChosenFolders(appFolder, {
    writing: asString(held['writing'], 'writing'),
    logs: asString(held['logs'], 'logs'),
  });
  log.warn('The folders were pointed somewhere else', held);
});

/*
  Everything again from the top, because the folders are settled here rather
  than in the window: a reloaded renderer would be handed the paths this process
  worked out at startup, and the log would carry on writing where it always
  did. `exit` rather than `quit` so nothing can decline to close — there is
  nothing unsaved to protect, the panel's own OK is what got us here.
*/
handle('app:restart', async () => {
  log.warn('Starting again so the folders take effect');
  app.relaunch();
  app.exit(0);
});
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

/**
 * Stops the window being dragged off the desk.
 *
 * Windows says before it moves a window, and lets us say no — so the window
 * stops at the edge while his hand carries on, rather than being fetched back
 * from somewhere he had already put it.
 *
 * The desk is every screen he has taken together, not the nearest one: a window
 * on its way from one monitor to another is over the edge of both for a moment,
 * and clamping it to whichever was closest would refuse the journey.
 *
 * Deliberately no window styles touched. Holding the window in place by taking
 * the maximise button away was tried and reverted, because changing how Windows
 * is allowed to size a window breaks after a minimise or a snap — and does it
 * quietly, days later. Refusing a move cannot do that: if this is wrong, it is
 * wrong in the hand, immediately, while he drags.
 */
function keepWindowOnTheDesk(window: BrowserWindow): void {
  let correcting = false;

  const fit = (bounds: Rect): void => {
    // A maximised window legitimately overhangs the work area by its border,
    // and a snapped one is the operating system's business, not ours.
    if (correcting || window.isDestroyed() || window.isMaximized()) return;

    const desk = deskAround(screen.getAllDisplays().map((display) => display.workArea));
    const kept = keptOnTheDesk(bounds, desk);
    if (kept === null) return;

    correcting = true;
    window.setBounds(kept);
    correcting = false;
  };

  window.on('will-move', (event, newBounds) => {
    const desk = deskAround(screen.getAllDisplays().map((display) => display.workArea));
    if (keptOnTheDesk(newBounds, desk) === null) return;
    // Refused, and put where it is allowed to be instead, so it slides along
    // the edge rather than stopping dead under his hand.
    event.preventDefault();
    fit(newBounds);
  });

  // Whatever the first one missed: a move it does not fire for, or a screen
  // unplugged while the window was on it.
  window.on('moved', () => {
    fit(window.getBounds());
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

  keepWindowOnTheDesk(window);

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
