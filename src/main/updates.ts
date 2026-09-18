import { app } from 'electron';
import electronUpdater from 'electron-updater';

import type { Logger } from './log.ts';

// electron-updater is CommonJS, so the named export isn't reliably reachable
// through an ESM import.
const { autoUpdater } = electronUpdater;

/**
 * Checks once at startup and installs on quit.
 *
 * He is never asked about updates. There's no prompt to dismiss, nothing to
 * approve, and nothing that can interrupt him mid-essay: the download happens
 * in the background and the swap happens after he's closed the app.
 */
export function startUpdateChecks(log: Logger): void {
  const updates = log.scoped('updater');

  if (!app.isPackaged) {
    updates.info('Skipping update check: not a packaged build');
    return;
  }

  // Updates are silent by design, which means a broken updater is silent too.
  // This log is the only place it will ever show up.
  autoUpdater.logger = {
    debug: (message: unknown) => updates.debug(String(message)),
    info: (message: unknown) => updates.info(String(message)),
    warn: (message: unknown) => updates.warn(String(message)),
    error: (message: unknown) => updates.error(String(message)),
  };

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // Updates are fetched by the app itself, never through a browser download.
  autoUpdater.disableWebInstaller = true;

  autoUpdater.on('checking-for-update', () => updates.info('Checking for update'));
  autoUpdater.on('update-available', (info) => updates.info('Update available', { version: info.version }));
  autoUpdater.on('update-not-available', () => updates.info('Already up to date'));
  autoUpdater.on('download-progress', (progress) =>
    updates.debug('Downloading update', { percent: Math.round(progress.percent) }),
  );
  autoUpdater.on('update-downloaded', (info) =>
    updates.info('Update downloaded, installing on quit', { version: info.version }),
  );
  autoUpdater.on('error', (error) => updates.error('Updater error', error));

  autoUpdater.checkForUpdates().catch((error: unknown) => {
    updates.error('Update check failed', error);
  });
}
