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

/** What the interface asked to have run before the window goes. */
let finishBeforeClose: (() => Promise<void>) | null = null;

/**
 * Closing the window, as the packaged app does it.
 *
 * Electron holds the real window open, asks the interface to finish what it
 * was doing, and closes once it answers. This is that sequence with the window
 * left out: the same call, awaited the same way, so the half of it that lives
 * in shared code is exercised here rather than only on his machine.
 *
 * On `window` rather than behind `?test`, like `showFiles` beside it: it draws
 * nothing and this host is never built into what he installs.
 */
function offerTheCloseSequence(): void {
  Object.defineProperty(window, 'closeWindow', {
    value: async (): Promise<void> => {
      await finishBeforeClose?.();
    },
    writable: true,
  });
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
    runMode: 'browser',
    files: createMockFileSystem(),
    writingFolder: MOCK_WRITING_FOLDER,
    appFolder: MOCK_APP_FOLDER,
    log: consoleLog,
    /*
      The page's own clipboard, which is all a tab has. It needs a secure page
      and a gesture behind it, so it works from localhost and from a click and
      would not from a file opened off disk — which is why the packaged app
      uses Electron's instead of this.
    */
    copyToClipboard: (text: string) => navigator.clipboard.writeText(text),
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
    // The tab's own equivalent. Nothing is settled outside the page here, so
    // reloading it really is starting again.
    restart: async () => {
      window.location.reload();
    },
    /*
      Kept rather than hung off `pagehide`.

      A tab cannot be held open while a promise settles, so wiring this to a
      real browser close would do the polite thing at the moment nobody is
      watching — and would leave the sequence that matters untested. What this
      host is for is standing in for the packaged app, and the packaged app
      asks the window to finish and waits for the answer before it goes.

      So the callback is kept, and `closeWindow` below runs the same sequence
      on demand. What cannot be had here either way is Electron's half: that
      the close event is really intercepted and the window really shuts
      afterwards.
    */
    onBeforeClose: (finish: () => Promise<void>) => {
      finishBeforeClose = finish;
    },
    setZoom,
  };

  await startApp(host);
  offerTheFileList();
  offerTheCloseSequence();
}

void main();
