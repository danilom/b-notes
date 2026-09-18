import { BUILD_STAMP } from '../platform/build-info.ts';
import type { RendererLog } from '../platform/log-bridge.ts';
import { type Note, type NoteStore, isEmptied } from '../notes/note.ts';
import { type Language, describeWhen, strings } from '../language/wording.ts';
import { renderList } from './note-list.ts';

declare global {
  interface Window {
    notes?: NoteStore;
    log?: RendererLog;
  }
}

/** Long enough that he isn't saved mid-word, short enough to never lose a thought. */
const AUTOSAVE_IDLE_MS = 800;
const LAST_OPEN_KEY = 'b-notes:last-open';

const language: Language = 'sr';
const words = strings(language);

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

function element<T extends Element>(id: string, kind: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof kind)) throw new Error(`Missing element: #${id}`);
  return found;
}

const listPane = element('list', HTMLDivElement);
const editor = element('editor', HTMLTextAreaElement);
const status = element('status', HTMLDivElement);
const search = element('search', HTMLInputElement);
const newNote = element('new-note', HTMLButtonElement);

/**
 * The store is handed in rather than chosen here, so nothing in the interface
 * knows the mock exists. It must never reach the app he installs.
 */
let store: NoteStore;

let notes: Note[] = [];
let openId: string | null = null;
let savedAt: number | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function draw(): void {
  renderList(listPane, { notes, query: search.value, openId, language });
}

function showStatus(): void {
  if (openId === null && editor.value.trim().length === 0) {
    status.textContent = words.startWriting;
    return;
  }
  if (saveTimer !== undefined) {
    status.textContent = words.saving;
    return;
  }
  status.textContent =
    savedAt === null
      ? words.notSaved
      : words.savedAgo(describeWhen(savedAt, language));
}

async function saveNow(): Promise<void> {
  const text = editor.value;
  const id = await store.save(openId, text);
  if (id === null) return;

  const wasNew = openId === null;
  openId = id;
  savedAt = Date.now();
  window.localStorage.setItem(LAST_OPEN_KEY, id);

  // Reload rather than patch: saving can rename the note, which moves it in the
  // list, and a stale entry is exactly the kind of thing that reads as loss.
  notes = await store.list();
  draw();
  showStatus();
  if (wasNew) log.info('Created a text', { id });
}

function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    saveNow().catch((error: unknown) => {
      status.textContent = words.notSaved;
      log.error('Could not save', describeError(error));
    });
  }, AUTOSAVE_IDLE_MS);
  showStatus();
}

async function open(id: string): Promise<void> {
  if (saveTimer !== undefined) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    await saveNow();
  }

  const note = notes.find((candidate) => candidate.id === id);
  if (note === undefined) return;

  openId = id;
  editor.value = note.text;
  savedAt = note.updatedAt;
  window.localStorage.setItem(LAST_OPEN_KEY, id);
  editor.setSelectionRange(0, 0);
  editor.scrollTop = 0;
  draw();
  showStatus();
  log.info('Opened a text', { id });
}

listPane.addEventListener('click', (event) => {
  const row = (event.target as Element | null)?.closest('.note');
  const id = row instanceof HTMLElement ? row.dataset['id'] : undefined;
  if (id !== undefined) void open(id);
});

editor.addEventListener('input', scheduleSave);

search.addEventListener('input', () => {
  draw();
});

newNote.addEventListener('click', () => {
  openId = null;
  savedAt = null;
  editor.value = '';
  window.localStorage.removeItem(LAST_OPEN_KEY);
  draw();
  showStatus();
  editor.focus();
  log.info('Started a new text');
});

export async function startApp(chosen: NoteStore, backend: string): Promise<void> {
  store = chosen;
  newNote.textContent = words.newNote;
  search.placeholder = words.searchPlaceholder;
  search.setAttribute('aria-label', words.searchLabel);

  notes = await store.list();

  // Emptied notes are put away at startup, never while he's working — a note
  // vanishing moments after he cleared it is the unexplained movement that
  // unsettles him. An empty row tells him nothing either way.
  const emptied = notes.filter(isEmptied);
  if (emptied.length > 0) {
    for (const note of emptied) await store.moveToDeleted(note.id);
    notes = await store.list();
    log.info('Put emptied texts away', { count: emptied.length });
  }

  // Reopen what he was last in. The search is deliberately not restored — a
  // filtered list on startup looks exactly like texts having gone missing.
  const last = window.localStorage.getItem(LAST_OPEN_KEY);
  if (last !== null && notes.some((note) => note.id === last)) {
    await open(last);
  } else {
    draw();
    showStatus();
  }

  log.info('Ready', { build: BUILD_STAMP, notes: notes.length, backend });
}
