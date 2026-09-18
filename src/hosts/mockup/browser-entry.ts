import { startApp } from '../../ui/ui-app.ts';
import { createMockFileSystem, seedIfEmpty } from './mock-file-system.ts';

/**
 * The interface's entry point in a plain browser, where the UI is developed.
 *
 * Like the Electron entry beside it, all it provides is a filesystem. This
 * folder is the only one that knows the pretend one exists.
 */
async function main(): Promise<void> {
  await seedIfEmpty();
  await startApp(createMockFileSystem(), 'mock');
}

void main();
