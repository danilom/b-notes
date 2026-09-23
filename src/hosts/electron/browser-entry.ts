import type { FileSystem } from '../../platform/file-system.ts';
import type { Host, RunMode } from '../../platform/host.ts';
import type { Log } from '../../platform/logging.ts';
import { startApp } from '../../ui/ui-app.ts';

declare global {
  interface Window {
    files?: FileSystem;
    folders?: () => Promise<{ writing: string; app: string; logs: string; mode: RunMode }>;
    openFolder?: (path: string) => Promise<void>;
    copyToClipboard?: (text: string) => Promise<void>;
    chooseFolder?: (from: string) => Promise<string | null>;
    rememberFolders?: (next: { writing: string; logs: string }) => Promise<void>;
    restart?: () => Promise<void>;
    log?: Log;
    setZoom?: (factor: number) => void;
  }
}

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
    chooseFolder,
    rememberFolders,
    restart,
    log,
    setZoom,
  } = window;
  if (
    files === undefined ||
    folders === undefined ||
    openFolder === undefined ||
    copyToClipboard === undefined ||
    chooseFolder === undefined ||
    rememberFolders === undefined ||
    restart === undefined ||
    log === undefined ||
    setZoom === undefined
  ) {
    throw new Error('No bridge to the app: the preload script did not run.');
  }

  // Only the main process knows where Windows put his Documents folder, so the
  // locations come across the bridge rather than being worked out here.
  const where = await folders();

  const host: Host = {
    runMode: where.mode,
    files,
    writingFolder: where.writing,
    appFolder: where.app,
    logsFolder: where.logs,
    openFolder,
    copyToClipboard,
    chooseFolder,
    rememberFolders,
    restart,
    log,
    setZoom,
  };

  await startApp(host);
}

void main();
