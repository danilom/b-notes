import type { FileSystem } from '../../platform/file-system.ts';
import type { ChosenPlaces, Host, RunMode } from '../../platform/host.ts';
import { appUpdateFrom } from '../../platform/app-update.ts';
import { type LektorProgress, lektorProgressFrom } from '../../platform/lektor-progress.ts';
import type { LektorRequest, LektorResponse } from '../../platform/lektor-remote.ts';
import type { Log } from '../../platform/logging.ts';
import type { OtherEditors } from '../../platform/other-editors.ts';
import { startApp } from '../../ui/ui-app.ts';
import { withAbsences } from './ipc-file-system.ts';

declare global {
  interface Window {
    files?: FileSystem;
    folders?: () => Promise<{
      resoph: string | null;
      notes: string;
      app: string;
      logs: string;
      machine: string;
      mode: RunMode;
    }>;
    openFolder?: (path: string) => Promise<void>;
    copyToClipboard?: (text: string) => Promise<void>;
    readClipboard?: () => Promise<string>;
    appUpdateState?: () => Promise<unknown>;
    onAppUpdate?: (listener: (update: unknown) => void) => void;
    lektorRequest?: (id: number, request: LektorRequest) => Promise<LektorResponse>;
    lektorStop?: (id: number) => Promise<void>;
    onLektorProgress?: (listener: (id: number, progress: unknown) => void) => void;
    onBeforeClose?: (finish: () => Promise<void>) => void;
    chooseFolder?: (from: string) => Promise<string | null>;
    rememberFolders?: (next: ChosenPlaces) => Promise<void>;
    restart?: () => Promise<void>;
    otherEditors?: OtherEditors;
    log?: Log;
    setZoom?: (factor: number) => void;
  }
}

let lastLektorRequest = 0;
/** Who wants to hear how each running request is getting on, by its number. */
const lektorListeners = new Map<number, (progress: LektorProgress) => void>();

/**
 * The packaged app's host: everything here comes across the preload bridge.
 *
 * It assembles capabilities and starts the interface. It knows nothing about
 * notes, and it cannot reach the pretend host beside it — which is what keeps
 * the mock out of what he installs.
 */
async function main(): Promise<void> {
  const {
    files,
    folders,
    openFolder,
    copyToClipboard,
    readClipboard,
    appUpdateState,
    onAppUpdate,
    lektorRequest,
    lektorStop,
    onLektorProgress,
    onBeforeClose,
    chooseFolder,
    rememberFolders,
    restart,
    otherEditors,
    log,
    setZoom,
  } = window;
  if (
    files === undefined ||
    folders === undefined ||
    openFolder === undefined ||
    copyToClipboard === undefined ||
    readClipboard === undefined ||
    appUpdateState === undefined ||
    onAppUpdate === undefined ||
    lektorRequest === undefined ||
    lektorStop === undefined ||
    onLektorProgress === undefined ||
    onBeforeClose === undefined ||
    chooseFolder === undefined ||
    rememberFolders === undefined ||
    restart === undefined ||
    otherEditors === undefined ||
    log === undefined ||
    setZoom === undefined
  ) {
    throw new Error('No bridge to the app: the preload script did not run.');
  }

  // Only the main process knows where Windows put his Documents folder, so the
  // locations come across the bridge rather than being worked out here.
  onLektorProgress((id, raw) => {
    const progress = lektorProgressFrom(raw);
    if (progress !== null) lektorListeners.get(id)?.(progress);
  });

  const where = await folders();

  const host: Host = {
    runMode: where.mode,
    // Nothing here is pretend, so there is nothing of the browser's to offer.
    testTools: null,
    // Wrapped, or an absence crossing back from the other process arrives as
    // an ordinary failure and every catch built on telling the two apart lets
    // it through. See `withAbsences`.
    files: withAbsences(files),
    resophFolder: where.resoph,
    notesFolder: where.notes,
    machineName: where.machine,
    appFolder: where.app,
    logsFolder: where.logs,
    openFolder,
    copyToClipboard,
    readClipboard,
    onAppUpdate: (listener) => {
      onAppUpdate((raw) => listener(appUpdateFrom(raw)));
      // Asked after listening, so a change between the two is not lost. The main process
      // answers and tells in the order things happened, so the answer never undoes a change.
      appUpdateState().then(
        (raw) => listener(appUpdateFrom(raw)),
        (error: unknown) => log.warn('Could not ask where a new version stands', error),
      );
    },
    askLektorService: async (request, stop, onProgress) => {
      lastLektorRequest += 1;
      const id = lastLektorRequest;
      // A signal can't cross the bridge, so the stop goes over as a message of its own.
      stop.addEventListener('abort', () => void lektorStop(id), { once: true });
      lektorListeners.set(id, onProgress);
      try {
        return await lektorRequest(id, request);
      } finally {
        lektorListeners.delete(id);
      }
    },
    onBeforeClose,
    chooseFolder,
    rememberFolders,
    restart,
    otherEditors,
    log,
    setZoom,
  };

  await startApp(host);
}

void main();
