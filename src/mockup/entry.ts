import { startApp } from '../renderer/app.ts';
import { createMockNoteStore } from './note-store.ts';

/**
 * The entry point for a plain browser, where the UI is developed.
 *
 * This file and its neighbours are the only ones that know the mock exists; the
 * installed app is built from `src/renderer/entry.ts` instead and cannot reach
 * any of it.
 */
void startApp(window.notes ?? createMockNoteStore(), window.notes ? 'ipc' : 'mock');
