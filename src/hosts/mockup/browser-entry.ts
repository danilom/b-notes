import type { Host } from '../../platform/host.ts';
import type { Log } from '../../platform/logging.ts';
import { startApp } from '../../ui/ui-app.ts';
import {
  MOCK_APP_FOLDER,
  MOCK_WRITING_FOLDER,
  createMockFileSystem,
  seedIfEmpty,
} from './mock-file-system.ts';

/**
 * There is no log file in a browser, so the console stands in. Good enough for
 * development, which is the only place this host runs.
 */
const consoleLog: Log = {
  info: (message, detail) => console.info(message, detail),
  warn: (message, detail) => console.warn(message, detail),
  error: (message, detail) => console.error(message, detail),
};

/**
 * The browser's host, where the interface is developed.
 *
 * It provides the same capabilities the packaged app does, backed by a pretend
 * filesystem. This folder is the only one that knows any of it is pretend.
 */
async function main(): Promise<void> {
  await seedIfEmpty();

  const host: Host = {
    name: 'browser',
    files: createMockFileSystem(),
    writingFolder: MOCK_WRITING_FOLDER,
    appFolder: MOCK_APP_FOLDER,
    log: consoleLog,
  };

  await startApp(host);
}

void main();
