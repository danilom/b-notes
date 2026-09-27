import { type FileInfo, type FileSystem, FolderMissing } from '../platform/file-system.ts';
import type { Log } from '../platform/logging.ts';
import { EXTENSION, idOf, isNoteFile } from './note-naming.ts';
import { composeResophText, titleOfResophName } from './resoph-note.ts';

/** One file in Resoph's folder, read as Resoph shows it. */
export interface ResophText {
  /** The file's name without `.txt`, exactly as it is on disk. */
  stem: string;
  file: FileInfo;
  /** Title and file together, as Resoph shows the note. Line endings `\n`. */
  text: string;
}

export interface ResophFolder {
  /** Every note in the folder. Read afresh only where a file has changed. */
  list(): Promise<ResophText[]>;
  /** One note, or null when its file is not there. */
  read(stem: string): Promise<ResophText | null>;
}

const nameOf = (path: string): string => path.split('/').at(-1) ?? path;

/**
 * His Resoph folder, which b-notes reads and never writes.
 *
 * Never written because Resoph keeps every note in a database of its own on
 * each of his machines and puts back whatever it remembers: anything b-notes
 * renamed, moved or deleted here would come back, and anything it wrote would
 * live on in every Resoph's database. So b-notes copies a text out of here the
 * first time he changes it, and this file only ever reads.
 *
 * Only the top level, and only `.txt`: Resoph lists subfolders too, but nothing
 * he writes lives in one, and the 0.7.0 leftovers do.
 *
 * Remembers what it read, by each file's time and size, so looking again when
 * b-notes comes back to the front reads only what changed — on his slowest
 * laptop, reading 11MB each time would be a pause he'd notice.
 */
export function createResophFolder(files: FileSystem, folder: string, log: Log): ResophFolder {
  const known = new Map<string, { updatedAt: number; bytes: number; text: string }>();
  // Said once a run: it is asked about every time b-notes comes to the front.
  let saidMissing = false;

  async function textOf(stem: string, file: FileInfo): Promise<string> {
    const held = known.get(file.path);
    if (held !== undefined && held.updatedAt === file.updatedAt && held.bytes === file.bytes) return held.text;
    const body = (await files.read(file.path)).replaceAll('\r\n', '\n');
    const text = composeResophText(titleOfResophName(stem), body);
    known.set(file.path, { updatedAt: file.updatedAt, bytes: file.bytes, text });
    return text;
  }

  async function filesInFolder(): Promise<FileInfo[]> {
    try {
      return (await files.list(folder)).filter((file) => isNoteFile(nameOf(file.path)));
    } catch (failure: unknown) {
      // A folder that is not there answers "nothing", like any other missing
      // folder in the app. Whether it *should* be there is asked separately,
      // at startup, where the answer can be told to someone.
      if (!(failure instanceof FolderMissing)) throw failure;
      if (!saidMissing) log.warn('The Resoph folder is not there', { folder });
      saidMissing = true;
      return [];
    }
  }

  return {
    async list(): Promise<ResophText[]> {
      const found = await filesInFolder();
      const present = new Set(found.map((file) => file.path));
      for (const path of known.keys()) if (!present.has(path)) known.delete(path);
      return Promise.all(
        found.map(async (file): Promise<ResophText> => {
          const stem = idOf(nameOf(file.path));
          return { stem, file, text: await textOf(stem, file) };
        }),
      );
    },

    async read(stem: string): Promise<ResophText | null> {
      const file = (await filesInFolder()).find((each) => nameOf(each.path) === `${stem}${EXTENSION}`);
      if (file === undefined) return null;
      return { stem, file, text: await textOf(stem, file) };
    },
  };
}
