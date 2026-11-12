import { type AppUpdate, isSameUpdate } from '../../platform/app-update.ts';
import type { Logger } from './log-file.ts';

/** The part of electron-updater's `autoUpdater` this listens to: an event emitter. */
export interface UpdaterEvents {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}

const versionOf = (info: unknown): string | null => {
  if (typeof info !== 'object' || info === null) return null;
  const { version } = info as Record<string, unknown>;
  return typeof version === 'string' && version !== '' ? version : null;
};

/**
 * Logs what the updater does and tells `tell` where a new version stands, whenever that changes.
 *
 * Only listens: how updates are fetched and installed is set in `app-updates.ts` and not touched
 * here. An error says nothing on screen, only in the log: a status line that showed a download
 * and then went quiet is no worse than one that never showed it, and he can do nothing about it.
 * Kept apart from that file because it needs nothing of Electron's, so it can be tested.
 */
export function followAppUpdates(updater: UpdaterEvents, log: Logger, tell: (update: AppUpdate) => void): void {
  let now: AppUpdate = { kind: 'none' };
  // electron-updater says "downloaded" again on a start where it finds the download already made; told once is enough.
  const become = (next: AppUpdate): void => {
    if (isSameUpdate(next, now)) return;
    now = next;
    tell(next);
  };

  updater.on('checking-for-update', () => log.info('Checking for update'));
  updater.on('update-not-available', () => log.info('Already up to date'));
  updater.on('update-available', (info) => {
    const version = versionOf(info);
    log.info('Update available', { version });
    if (version !== null && now.kind !== 'downloaded') become({ kind: 'downloading', version });
  });
  updater.on('download-progress', (progress) => {
    const percent = typeof progress === 'object' && progress !== null ? (progress as Record<string, unknown>)['percent'] : undefined;
    log.debug('Downloading update', { percent: typeof percent === 'number' ? Math.round(percent) : null });
  });
  updater.on('update-downloaded', (info) => {
    const version = versionOf(info);
    log.info('Update downloaded, installing on quit', { version });
    if (version !== null) become({ kind: 'downloaded', version });
  });
  updater.on('error', (error) => {
    log.error('Updater error', error);
    // A download that failed is no longer on its way; one already downloaded still installs on quit.
    if (now.kind === 'downloading') become({ kind: 'none' });
  });
}
