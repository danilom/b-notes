import type { FileInfo, FileSystem } from '../../platform/file-system.ts';
import { startApp } from '../../ui/ui-app.ts';

declare global {
  interface Window {
    files?: FileSystem;
  }
}

/**
 * The interface's entry point inside the packaged app.
 *
 * All it does is hand over the filesystem the preload bridge exposes. It knows
 * nothing about notes, and it cannot reach the pretend filesystem the browser
 * build uses — that's what keeps the mock out of what he installs.
 */
const bridged = window.files;
if (bridged === undefined) {
  throw new Error('No filesystem bridge: the preload script did not run.');
}

/** Structured clone hands back plain objects, which is all FileInfo ever is. */
const files: FileSystem = {
  list: (folder?: string): Promise<FileInfo[]> => bridged.list(folder),
  read: (path: string) => bridged.read(path),
  write: (path: string, text: string) => bridged.write(path, text),
  rename: (from: string, to: string) => bridged.rename(from, to),
};

void startApp(files, 'ipc');
