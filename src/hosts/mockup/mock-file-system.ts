import { type FileInfo, type FileSystem, requireSafePath } from '../../platform/file-system.ts';

const KEY = 'b-notes:mock-files';

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

const folderOf = (at: string): string | undefined => {
  const cut = at.lastIndexOf('/');
  return cut === -1 ? undefined : at.slice(0, cut);
};

/**
 * Pretend files in the browser, so the interface can be developed without
 * Electron. No sync, no conflicted copies, no disk that can fail — it stands in
 * for the filesystem, not for his machine.
 */
export function createMockFileSystem(): FileSystem {
  return {
    async list(folder?: string): Promise<FileInfo[]> {
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
      const file = load().get(requireSafePath(at));
      if (file === undefined) throw new Error(`No such file: ${at}`);
      return file.text;
    },

    async write(at: string, text: string): Promise<void> {
      const files = load();
      files.set(requireSafePath(at), { text, updatedAt: Date.now() });
      store(files);
    },

    async rename(from: string, to: string): Promise<void> {
      const files = load();
      const file = files.get(requireSafePath(from));
      if (file === undefined) throw new Error(`No such file: ${from}`);
      files.delete(from);
      files.set(requireSafePath(to), file);
      store(files);
    },
  };
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
    seeded.set(entry.id, { text: entry.text, updatedAt: entry.updatedAt });
  }
  store(seeded);
}
