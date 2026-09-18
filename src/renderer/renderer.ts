import type { NoteStore } from '../shared/notes.ts';
import { createMockNoteStore } from './mock-store.ts';

declare global {
  interface Window {
    notes?: NoteStore;
  }
}

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`Missing element: #${id}`);
  return found;
}

/**
 * The preload script only exists inside Electron, so its absence is what marks
 * a plain browser tab and selects the mock backend.
 */
const preloaded = window.notes;
const store: NoteStore = preloaded ?? createMockNoteStore();

async function report(): Promise<void> {
  element('backend').textContent = preloaded ? 'filesystem (via IPC)' : 'localStorage mock';

  try {
    const notes = await store.list();
    element('count').textContent = String(notes.length);
  } catch (error) {
    element('count').textContent = 'failed — see console';
    console.error('Could not list notes', error);
  }
}

void report();
