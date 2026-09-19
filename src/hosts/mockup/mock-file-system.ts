import type { FileInfo, FileSystem } from '../../platform/file-system.ts';
import { longDiffSample } from './mock-long-diff-sample.ts';
import { versionsSample } from './mock-versions-sample.ts';

const KEY = 'b-notes:mock-files';

/** Where the browser host pretends his writing and our own files live. */
export const MOCK_WRITING_FOLDER = 'Tekstovi';
export const MOCK_APP_FOLDER = 'Podaci';

interface StoredFile {
  text: string;
  updatedAt: number;
}

function isStoredFile(value: unknown): value is StoredFile {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate['text'] === 'string' && typeof candidate['updatedAt'] === 'number';
}

function load(): Map<string, StoredFile> {
  const raw = window.localStorage.getItem(KEY);
  if (raw === null) return new Map();

  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) return new Map();

  const files = new Map<string, StoredFile>();
  for (const [at, file] of Object.entries(parsed)) {
    if (isStoredFile(file)) files.set(at, file);
  }
  return files;
}

function store(files: Map<string, StoredFile>): void {
  window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(files)));
}

const folderOf = (at: string): string => at.slice(0, at.lastIndexOf('/'));

/**
 * Pretend files in the browser, so the interface can be developed without
 * Electron. No sync, no conflicted copies, no disk that can fail — it stands in
 * for the filesystem, not for his machine.
 *
 * Paths are keys. Folders exist only because keys contain slashes, which is
 * enough to behave like the real thing from the app's side.
 */
export function createMockFileSystem(): FileSystem {
  return {
    async list(folder: string): Promise<FileInfo[]> {
      const wanted: FileInfo[] = [];
      for (const [at, file] of load()) {
        if (folderOf(at) !== folder) continue;
        wanted.push({
          path: at,
          updatedAt: file.updatedAt,
          bytes: new TextEncoder().encode(file.text).length,
        });
      }
      return wanted;
    },

    async read(at: string): Promise<string> {
      const file = load().get(at);
      if (file === undefined) throw new Error(`No such file: ${at}`);
      return file.text;
    },

    async write(at: string, text: string): Promise<void> {
      const files = load();
      files.set(at, { text, updatedAt: Date.now() });
      store(files);
    },

    async removeEmptyFile(at: string): Promise<boolean> {
      const files = load();
      const file = files.get(at);
      if (file === undefined || file.text.trim().length > 0) return false;
      files.delete(at);
      store(files);
      return true;
    },

    async removeFile(at: string): Promise<void> {
      const files = load();
      // Throws for a file that isn't there, as unlink does, so the two hosts
      // fail the same way rather than one of them quietly doing nothing.
      if (!files.delete(at)) throw new Error(`No such file: ${at}`);
      store(files);
    },

    async removeEmptyFolder(): Promise<void> {
      // Nothing to do: a folder here is a slash in a key, so an empty one has
      // already stopped existing.
    },

    async rename(from: string, to: string): Promise<void> {
      const files = load();
      const file = files.get(from);
      if (file === undefined) throw new Error(`No such file: ${from}`);
      files.delete(from);
      files.set(to, file);
      store(files);
    },
  };
}

/**
 * Every pretend file there is, with its size, for looking at while testing.
 *
 * Straight off the stored map rather than through `list`, on purpose: the point
 * is to see what is actually there, including the folders the app believes it
 * has tidied away and anything it has left behind in a corner.
 */
export function everyFile(): { path: string; bytes: number }[] {
  return [...load()]
    .map(([path, file]) => ({ path, bytes: new TextEncoder().encode(file.text).length }))
    .sort((first, second) => first.path.localeCompare(second.path));
}

/**
 * Puts the samples where the app will find them, every start.
 *
 * Over whatever is there rather than only when they are missing: what they
 * exist to show is only worth looking at while they still say what they were
 * written to say. Editing one in the browser therefore does not survive a
 * reload.
 */
export function placeSamples(): void {
  const now = Date.now();
  const files = load();
  for (const sample of [versionsSample, longDiffSample]) {
    for (const file of sample(now, MOCK_WRITING_FOLDER)) {
      files.set(file.path, { text: file.text, updatedAt: file.updatedAt });
    }
  }
  store(files);
}

/**
 * Fills an empty browser with the generated test corpus, so the list can be
 * judged against six hundred texts rather than five. Does nothing if the file
 * isn't being served, which is the ordinary case outside development.
 */
export async function seedIfEmpty(): Promise<void> {
  if (load().size > 0) return;

  const response = await fetch('corpus.json').catch(() => null);
  if (response === null || !response.ok) return;

  const seeded = new Map<string, StoredFile>();
  for (const entry of (await response.json()) as { id: string; text: string; updatedAt: number }[]) {
    seeded.set(`${MOCK_WRITING_FOLDER}/${entry.id}`, {
      text: entry.text,
      updatedAt: entry.updatedAt,
    });
  }
  store(seeded);
}
