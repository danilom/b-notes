import type { Note, NoteStore } from '../shared/notes.ts';
import { titleFrom } from '../shared/title.ts';

const KEY = 'b-notes:mock';
const DELETED_KEY = 'b-notes:mock-deleted';

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

/** Mirrors the real store's collision rule, so ids look the same in both. */
function freeId(notes: Map<string, MockNote>, title: string, own: string | null): string {
  const base = title.length > 0 ? title : 'Bez naslova';
  for (let attempt = 0; ; attempt += 1) {
    const candidate = attempt === 0 ? `${base}.txt` : `${base} (${attempt}).txt`;
    if (candidate === own || !notes.has(candidate)) return candidate;
  }
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

let sweptThisSession = false;

/**
 * Mirrors the startup sweep the real store does, so the browser shows what the
 * app would actually show. Without it the mock keeps emptied notes in the list
 * as blank rows and every judgement made here would be against a fiction.
 *
 * Once per load, like startup — not while he's working.
 */
function sweepEmptied(): void {
  if (sweptThisSession) return;
  sweptThisSession = true;

  const notes = load();
  const emptied = [...notes].filter(([, note]) => note.text.trim().length === 0);
  if (emptied.length === 0) return;

  const deleted = window.localStorage.getItem(DELETED_KEY);
  const kept: Record<string, MockNote> = deleted === null ? {} : JSON.parse(deleted);
  for (const [id, note] of emptied) {
    kept[id] = note;
    notes.delete(id);
  }
  window.localStorage.setItem(DELETED_KEY, JSON.stringify(kept));
  store(notes);
}

export function createMockNoteStore(): NoteStore {
  return {
    async list(): Promise<Note[]> {
      await seedIfEmpty();
      sweepEmptied();
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
      if (id === null && text.trim().length === 0) return null;

      const notes = load();
      const wanted = freeId(notes, titleFrom(text), id);

      if (id !== null && id !== wanted) notes.delete(id);
      notes.set(wanted, { text, updatedAt: Date.now() });
      store(notes);
      return wanted;
    },
  };
}
