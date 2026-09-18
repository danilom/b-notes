import type { NoteStore } from '../shared/notes.ts';
import { startApp } from './app.ts';

declare global {
  interface Window {
    notes?: NoteStore;
  }
}

/**
 * The entry point for the installed app. It knows only the real store, which is
 * how `src/mockup/` stays out of what he runs.
 */
const store = window.notes;
if (store === undefined) {
  throw new Error('No storage bridge: the preload script did not run.');
}

void startApp(store, 'ipc');
