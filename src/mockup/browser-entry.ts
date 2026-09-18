import { createNoteStore } from '../notes/note-store.ts';
import { createMockFileSystem, seedIfEmpty } from './mock-file-system.ts';
import { startApp } from '../ui/ui-app.ts';

/**
 * The entry point for a plain browser, where the UI is developed.
 *
 * This folder is the only one that knows the pretend filesystem exists; the
 * installed app is built from `src/renderer/entry.ts` and cannot reach it.
 */
async function main(): Promise<void> {
  await seedIfEmpty();
  const store = window.notes ?? createNoteStore(createMockFileSystem());
  await startApp(store, window.notes ? 'ipc' : 'mock');
}

void main();
