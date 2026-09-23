import {
  type FileInfo,
  type FileSystem,
  FileMissing,
  FolderMissing,
} from '../../platform/file-system.ts';

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
      // Folders here exist only because keys contain slashes, so one is real
      // exactly when something lives in or under it. The real filesystem throws
      // for a folder that is not there, and so must this, or the mock would
      // answer a question differently from the thing it stands in for.
      let anyUnder = false;
      for (const [at, file] of load()) {
        if (at.startsWith(`${folder}/`)) anyUnder = true;
        if (folderOf(at) !== folder) continue;
        wanted.push({
          path: at,
          updatedAt: file.updatedAt,
          bytes: new TextEncoder().encode(file.text).length,
        });
      }
      if (!anyUnder) throw new FolderMissing(folder);
      return wanted;
    },

    async listFolders(folder: string): Promise<string[]> {
      const under = `${folder}/`;
      const names = new Set<string>();
      let anyUnder = false;
      for (const at of load().keys()) {
        if (!at.startsWith(under)) continue;
        anyUnder = true;
        // A folder is real here exactly when a key has a further slash past
        // this one. The segment between the two is what it is called.
        const rest = at.slice(under.length);
        const slash = rest.indexOf('/');
        if (slash > 0) names.add(rest.slice(0, slash));
      }
      if (!anyUnder) throw new FolderMissing(folder);
      return [...names];
    },

    /**
     * Folders here exist only because keys contain slashes, so one is real
     * exactly when something lives in it. Close enough to the real answer for
     * the one question this is asked.
     */
    async folderExists(folder: string): Promise<boolean> {
      for (const at of load().keys()) if (at.startsWith(`${folder}/`)) return true;
      return false;
    },

    async read(at: string): Promise<string> {
      const file = load().get(at);
      if (file === undefined) throw new FileMissing(at);
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
 * Fills an empty browser with the generated test corpus, so the list can be
 * judged against six hundred texts rather than five. Does nothing if the file
 * isn't being served, which is the ordinary case outside development.
 *
 * The only way files arrive here. The development samples used to be written
 * over the top on every load, which made a second arrival path and two bugs of
 * its own — copies breeding on each reload, and a second Versions sample once
 * the app had renamed the first. They are in `corpus.json` now, seeded like any
 * other text and editable like one; `corpus.cmd` and an empty browser is how
 * they come back as they were.
 */
export async function seedIfEmpty(): Promise<void> {
  if (load().size > 0) return;

  let response: Response;
  try {
    response = await fetch('corpus.json');
  } catch {
    // Not being served is the ordinary case outside development, and the app
    // starts empty rather than not at all.
    return;
  }
  if (!response.ok) return;

  const seeded = new Map<string, StoredFile>();
  for (const entry of (await response.json()) as { id: string; text: string; updatedAt: number }[]) {
    seeded.set(`${MOCK_WRITING_FOLDER}/${entry.id}`, {
      text: entry.text,
      updatedAt: entry.updatedAt,
    });
  }
  store(seeded);
}
