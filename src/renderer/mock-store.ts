import type { NoteStore, NoteSummary } from '../shared/notes.ts';

const KEY = 'brano-notes:mock';

interface MockNote {
  title: string;
  text: string;
  updatedAt: number;
}

function isMockNote(value: unknown): value is MockNote {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['title'] === 'string' &&
    typeof candidate['text'] === 'string' &&
    typeof candidate['updatedAt'] === 'number'
  );
}

function load(): Map<string, MockNote> {
  const raw = window.localStorage.getItem(KEY);
  if (raw === null) return new Map();

  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) return new Map();

  const notes = new Map<string, MockNote>();
  for (const [id, note] of Object.entries(parsed)) {
    if (isMockNote(note)) notes.set(id, note);
  }
  return notes;
}

function save(notes: Map<string, MockNote>): void {
  window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(notes)));
}

function requireNote(notes: Map<string, MockNote>, id: string): MockNote {
  const note = notes.get(id);
  if (note === undefined) throw new Error(`No such note: ${id}`);
  return note;
}

/**
 * Stand-in for the filesystem so the UI can be developed and driven in a plain
 * browser tab. Deliberately not a faithful simulation of Dropbox behaviour —
 * it has no conflicted copies and no sync latency.
 */
export function createMockNoteStore(): NoteStore {
  return {
    async list(): Promise<NoteSummary[]> {
      return [...load()]
        .map(([id, note]) => ({ id, title: note.title, updatedAt: note.updatedAt }))
        .sort((first, second) => second.updatedAt - first.updatedAt);
    },

    async read(id: string): Promise<string> {
      return requireNote(load(), id).text;
    },

    async write(id: string, text: string): Promise<void> {
      const notes = load();
      const note = requireNote(notes, id);
      notes.set(id, { ...note, text, updatedAt: Date.now() });
      save(notes);
    },

    async create(title: string): Promise<string> {
      const notes = load();
      const id = `${title || 'Untitled'}.md`;
      notes.set(id, { title: title || 'Untitled', text: '', updatedAt: Date.now() });
      save(notes);
      return id;
    },
  };
}
