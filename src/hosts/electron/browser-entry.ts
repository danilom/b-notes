import type { FileSystem } from '../../platform/file-system.ts';
import type { Host } from '../../platform/host.ts';
import type { Log } from '../../platform/logging.ts';
import { startApp } from '../../ui/ui-app.ts';

declare global {
  interface Window {
    files?: FileSystem;
    folders?: () => Promise<{ writing: string; app: string }>;
    log?: Log;
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
  const files = window.files;
  const folders = window.folders;
  const log = window.log;
  if (files === undefined || folders === undefined || log === undefined) {
    throw new Error('No bridge to the app: the preload script did not run.');
  }

  // Only the main process knows where Windows put his Documents folder, so the
  // locations come across the bridge rather than being worked out here.
  const where = await folders();

  const host: Host = {
    name: 'electron',
    files,
    writingFolder: where.writing,
    appFolder: where.app,
    log,
  };

  await startApp(host);
}

void main();
