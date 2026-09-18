import { DELETED_FOLDER } from '../shared/note-naming.ts';
import type { Note, NoteStore } from '../shared/notes.ts';
import { deletedNameFor, planSave } from '../shared/save-plan.ts';
import { titleFrom } from '../shared/title.ts';

const KEY = 'b-notes:mock';
const DELETED_KEY = `b-notes:mock-${DELETED_FOLDER}`;

interface MockNote {
  text: string;
  updatedAt: number;
}

function isMockNote(value: unknown): value is MockNote {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate['text'] === 'string' && typeof candidate['updatedAt'] === 'number';
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

function store(notes: Map<string, MockNote>): void {
  window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(notes)));
}


/**
 * Stand-in for the filesystem so the UI can be developed and driven in a plain
 * browser. Deliberately not a faithful simulation of Dropbox behaviour — it has
 * no conflicted copies and no sync latency.
 */
/**
 * Fills an empty browser with the generated test corpus, so the list can be
 * judged against six hundred texts rather than five. Silently does nothing if
 * the file isn't being served — that's the ordinary case outside development.
 */
async function seedIfEmpty(): Promise<void> {
  if (load().size > 0) return;

  const response = await fetch('corpus.json').catch(() => null);
  if (response === null || !response.ok) return;

  const seeded = new Map<string, MockNote>();
  for (const entry of (await response.json()) as { id: string; text: string; updatedAt: number }[]) {
    seeded.set(entry.id, { text: entry.text, updatedAt: entry.updatedAt });
  }
  store(seeded);
}

export function createMockNoteStore(): NoteStore {
  return {
    async list(): Promise<Note[]> {
      await seedIfEmpty();
      return [...load()]
        .map(([id, note]) => ({
          id,
          title: titleFrom(note.text),
          text: note.text,
          updatedAt: note.updatedAt,
          bytes: new TextEncoder().encode(note.text).length,
        }))
        .sort((first, second) => second.updatedAt - first.updatedAt);
    },

    async read(id: string): Promise<string> {
      const note = load().get(id);
      if (note === undefined) throw new Error(`No such note: ${id}`);
      return note.text;
    },

    async save(id: string | null, text: string): Promise<string | null> {
      const notes = load();
      const action = await planSave(id, text, {
        takenNames: async () => new Set(notes.keys()),
        previousText: async () => (id === null ? '' : (notes.get(id)?.text ?? '')),
      });

      if (action.kind === 'none') return null;

      if (action.kind === 'writeAndRename') notes.delete(action.id);
      const saved = action.kind === 'write' ? action.id : action.to;
      notes.set(saved, { text, updatedAt: Date.now() });
      store(notes);
      return saved;
    },

    async moveToDeleted(id: string): Promise<void> {
      const notes = load();
      const note = notes.get(id);
      if (note === undefined) return;

      const raw = window.localStorage.getItem(DELETED_KEY);
      const deleted: Record<string, MockNote> = raw === null ? {} : JSON.parse(raw);
      deleted[deletedNameFor(id, new Set(Object.keys(deleted)))] = note;
      window.localStorage.setItem(DELETED_KEY, JSON.stringify(deleted));

      notes.delete(id);
      store(notes);
    },
  };
}
