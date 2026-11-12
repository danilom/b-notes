import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';

import { followAppUpdates } from '../src/hosts/electron/app-update-events.ts';
import type { Logger } from '../src/hosts/electron/log-file.ts';
import type { AppUpdate } from '../src/platform/app-update.ts';

/** A logger keeping what it was told, by level. */
function keptLog(): Logger & { lines: string[] } {
  const lines: string[] = [];
  const at = (): Logger & { lines: string[] } => ({
    lines,
    debug: (message) => lines.push(`debug ${message}`),
    info: (message) => lines.push(`info ${message}`),
    warn: (message) => lines.push(`warn ${message}`),
    error: (message) => lines.push(`error ${message}`),
    scoped: at,
  });
  return at();
}

/** electron-updater's autoUpdater as this sees it: an emitter, with what it was told kept. */
function following(): { updater: EventEmitter; told: AppUpdate[]; log: ReturnType<typeof keptLog> } {
  const updater = new EventEmitter();
  const told: AppUpdate[] = [];
  const log = keptLog();
  followAppUpdates(updater, log, (update) => told.push(update));
  return { updater, told, log };
}

describe('followAppUpdates', () => {
  it('tells of a download under way, then of it waiting to install', () => {
    const { updater, told } = following();

    updater.emit('checking-for-update');
    updater.emit('update-available', { version: '1.0.1' });
    updater.emit('download-progress', { percent: 42.4 });
    updater.emit('update-downloaded', { version: '1.0.1' });

    assert.deepEqual(told, [
      { kind: 'downloading', version: '1.0.1' },
      { kind: 'downloaded', version: '1.0.1' },
    ]);
  });

  it('tells nothing when there is no new version', () => {
    const { updater, told } = following();

    updater.emit('checking-for-update');
    updater.emit('update-not-available', { version: '1.0.0' });

    assert.deepEqual(told, []);
  });

  it('tells once of a download it is told about again, as on a start that finds it already made', () => {
    const { updater, told } = following();

    updater.emit('update-downloaded', { version: '1.0.1' });
    updater.emit('update-downloaded', { version: '1.0.1' });

    assert.deepEqual(told, [{ kind: 'downloaded', version: '1.0.1' }]);
  });

  it('goes back to nothing when a download fails, and logs the error', () => {
    const { updater, told, log } = following();

    updater.emit('update-available', { version: '1.0.1' });
    updater.emit('error', new Error('net::ERR_CONNECTION_RESET'));

    assert.deepEqual(told, [{ kind: 'downloading', version: '1.0.1' }, { kind: 'none' }]);
    assert.ok(log.lines.includes('error Updater error'));
  });

  it('keeps a finished download through a later error, since it still installs on quit', () => {
    const { updater, told } = following();

    updater.emit('update-downloaded', { version: '1.0.1' });
    updater.emit('error', new Error('something after'));

    assert.deepEqual(told, [{ kind: 'downloaded', version: '1.0.1' }]);
  });

  it('ignores an event that names no version, logging it all the same', () => {
    const { updater, told, log } = following();

    updater.emit('update-available', {});
    updater.emit('update-downloaded', null);

    assert.deepEqual(told, []);
    assert.ok(log.lines.includes('info Update available'));
    assert.ok(log.lines.includes('info Update downloaded, installing on quit'));
  });
});
