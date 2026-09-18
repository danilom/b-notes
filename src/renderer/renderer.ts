import { BUILD_STAMP } from '../shared/build-info.ts';
import type { RendererLog } from '../shared/logging.ts';
import type { NoteStore } from '../shared/notes.ts';
import { createMockNoteStore } from './mock-store.ts';

declare global {
  interface Window {
    notes?: NoteStore;
    log?: RendererLog;
  }
}

/**
 * In a browser tab there's no preload script and so no bridge to the log file.
 * The console is the only place left, and it's enough while developing.
 */
const log: RendererLog = window.log ?? {
  info: (message, detail) => console.info(message, detail),
  warn: (message, detail) => console.warn(message, detail),
  error: (message, detail) => console.error(message, detail),
};

/** Errors don't survive structured cloning intact, so flatten before sending. */
function describeError(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

window.addEventListener('error', (event) => {
  log.error('Uncaught error in renderer', {
    message: event.message,
    at: `${event.filename}:${event.lineno}:${event.colno}`,
    error: describeError(event.error),
  });
});

window.addEventListener('unhandledrejection', (event) => {
  log.error('Unhandled rejection in renderer', describeError(event.reason));
});

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
  element('build').textContent = BUILD_STAMP;

  try {
    const notes = await store.list();
    element('count').textContent = String(notes.length);
    log.info('Listed notes', { count: notes.length, backend: preloaded ? 'ipc' : 'mock' });
  } catch (error) {
    element('count').textContent = 'failed — see log';
    log.error('Could not list notes', describeError(error));
  }
}

void report();
