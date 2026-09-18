import { BrowserWindow, app, ipcMain } from 'electron';
import path from 'node:path';

import { BUILD_STAMP } from '../shared/build-info.ts';
import { LOG_LEVELS, createFileLogger } from './log.ts';
import { createFileNoteStore } from './note-store.ts';
import { startUpdateChecks } from './updates.ts';

// The machines this runs on have old integrated GPUs, where acceleration causes
// more rendering glitches than it prevents.
app.disableHardwareAcceleration();

const runMode = app.isPackaged ? 'installed' : 'dev';

// `userData` rather than `getPath('logs')` because it resolves before the app is
// ready, and startup is exactly when we most need somewhere to write.
const log = createFileLogger(path.join(app.getPath('userData'), 'logs'), runMode);
const rendererLog = log.scoped('renderer');

// Nothing here reaches a terminal: Electron detaches stdout on Windows, so an
// unhandled failure is invisible unless it lands in the log file. Neither of
// these quits — he may have text on screen, and staying up beats a tidy exit.
process.on('uncaughtException', (error) => log.error('Uncaught exception', error));
process.on('unhandledRejection', (reason) => log.error('Unhandled rejection', reason));

// Where notes live is not settled: they belong in the Dropbox folder, which
// needs detecting at first run. Documents keeps the scaffold runnable until then.
const notesDir = path.join(app.getPath('documents'), 'b-notes');
const store = createFileNoteStore(notesDir);

function asString(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string`);
  return value;
}

/** A null id means a note he has started but that has never been written. */
function asIdOrNull(value: unknown, name: string): string | null {
  if (value === null || value === undefined) return null;
  return asString(value, name);
}

function handle(channel: string, handler: (args: unknown[]) => Promise<unknown>): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    try {
      return await handler(args);
    } catch (error) {
      log.error(`${channel} failed`, error);
      throw error;
    }
  });
}

handle('notes:list', () => store.list());
handle('notes:read', (args) => store.read(asString(args[0], 'id')));
handle('notes:save', (args) => store.save(asIdOrNull(args[0], 'id'), asString(args[1], 'text')));
handle('notes:moveToDeleted', (args) => store.moveToDeleted(asString(args[0], 'id')));

ipcMain.on('log:write', (_event, level: unknown, message: unknown, detail: unknown) => {
  // Coerced rather than validated: a malformed log call should still leave a
  // trace, since it means something upstream is already wrong.
  const chosen = LOG_LEVELS.find((candidate) => candidate === level) ?? 'info';
  rendererLog[chosen](typeof message === 'string' ? message : String(message), detail);
});

let mainWindow: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1100,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
    },
  });

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
    notesDir,
  });
  await app.whenReady();
  await createWindow();
  log.info('Window open');
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
