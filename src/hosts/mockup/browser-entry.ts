import type { Host } from '../../platform/host.ts';
import type { Log } from '../../platform/logging.ts';
import { startApp } from '../../ui/ui-app.ts';
import { addMockFileList } from './mock-file-list.ts';
import {
  MOCK_APP_FOLDER,
  MOCK_WRITING_FOLDER,
  createMockFileSystem,
  everyFile,
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
 * There is no window to scale in a tab we don't own, so the document is scaled
 * instead. `zoom` is Chromium's own property and lays out the same way its
 * window zoom does, which is close enough for developing against.
 */
function setZoom(factor: number): void {
  document.documentElement.style.zoom = String(factor);
}

/**
 * Puts the pretend filesystem where it can be looked at, given `?test`.
 *
 * Only ever in this host, which is the only one with a pretend filesystem and
 * which the packaged app is never built from — so there is nothing here to
 * leave switched on by accident. A button on screen, because reaching a
 * browser console is awkward from inside a pane, and `showFiles()` on the
 * window as well for when a console is at hand.
 */
function offerTheFileList(): void {
  if (!new URLSearchParams(window.location.search).has('test')) return;

  Object.defineProperty(window, 'showFiles', {
    value: (): { path: string; bytes: number }[] => {
      const files = everyFile();
      console.table(files);
      return files;
    },
    writable: true,
  });
  addMockFileList();
}

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
    logsFolder: `${MOCK_APP_FOLDER}/logs`,
    /*
      Nothing here can show a folder or ask for one: a browser tab has no
      desktop to open and no picker to raise. Stubbed rather than left out, so
      the advanced panel can be worked on here and behaves recognisably — and
      so the contract keeps both hosts answering for the same capabilities.
    */
    openFolder: async (path: string) => {
      window.alert(`Would open in Explorer:
${path}`);
    },
    chooseFolder: async (from: string) => window.prompt('Folder', from),
    rememberFolders: async (next: { writing: string; logs: string }) => {
      window.localStorage.setItem('b-notes:mock-folders', JSON.stringify(next));
    },
    setZoom,
  };

  await startApp(host);
  offerTheFileList();
}

void main();
