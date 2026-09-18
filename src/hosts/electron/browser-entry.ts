import type { FileSystem } from '../../platform/file-system.ts';
import type { Host } from '../../platform/host.ts';
import type { Log } from '../../platform/logging.ts';
import { startApp } from '../../ui/ui-app.ts';

declare global {
  interface Window {
    files?: FileSystem;
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
const files = window.files;
const log = window.log;
if (files === undefined || log === undefined) {
  throw new Error('No bridge to the app: the preload script did not run.');
}

const host: Host = { name: 'electron', files, log };

void startApp(host);
