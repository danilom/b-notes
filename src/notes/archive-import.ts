import { withoutDiacritics } from '../language/diacritics.ts';
import { type FileInfo, type FileSystem, FileMissing, FolderMissing } from '../platform/file-system.ts';
import { type Log, describeError } from '../platform/logging.ts';
import { ARCHIVE_FOLDER, EXTENSION, RAW_ARCHIVE_FOLDER } from './note-naming.ts';
import { titleOfResophName } from './resoph-note.ts';

/**
 * Turning an old machine's writing into an archive b-notes can read.
 *
 * What arrives in `Arhiva-raw` is in whatever shape it left: Resoph's, with
 * the title in the file's name and not in the file, or a Simplenote export's,
 * with the title inside, as `.md` or `.txt`. An archive in `Arhiva` is in
 * b-notes' shape, the title as the first line. This copies one into the
 * other, a folder at a time, and never writes anything anywhere else:
 * `Arhiva-raw` is only read, and nothing already in `Arhiva` is overwritten.
 *
 * Run by whoever sets his machine up, from Advanced settings, never by him.
 */

/**
 * Left in an archive folder once its import has finished, and from then on
 * the sign that it is not to be touched again.
 *
 * A text he brings in from an archive leaves it, and an import that went by
 * what is missing would bring that text back into the archive the next time,
 * beside the one now in his list. Not `.txt`, so nothing lists it as a text.
 */
export const IMPORT_RECORD = '.b-notes-import.json';

/** What is read from a raw folder: both, since both have come off his machines. */
const SOURCE = /\.(md|txt)$/i;

/*
  Whether a file already opens with its title.

  Measured on the four archives off his machines: a Resoph file opens with
  his first sentence, and gets its title put above it; a Simplenote one opens
  with the title its name was made from, and is left as it is. Compared
  without case, diacritics or punctuation, which the names and first lines
  disagree about, and without a copy number — " (1)", " 2" — which only the
  name has. A name is matched as whole words, so a short title does not
  match every line that happens to begin with its letters, except a long one,
  which is a name Simplenote cut off in the middle of a word.
*/
const COPY_NUMBER = / *\(\d+\)$| +\d+$/;
const CUT_OFF = 20;

const comparable = (text: string): string =>
  withoutDiacritics(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function opensWithTitle(firstLine: string, title: string): boolean {
  const line = comparable(firstLine);
  for (const wanted of new Set([comparable(title), comparable(title.replace(COPY_NUMBER, ''))])) {
    if (wanted.length === 0) continue;
    if (line === wanted || line.startsWith(`${wanted} `)) return true;
    if (wanted.length >= CUT_OFF && line.startsWith(wanted)) return true;
  }
  // A title with no letters or digits at all, such as "- [ ]", as it is written.
  return comparable(title).length === 0 && title.trim().length > 0 && firstLine.trim().startsWith(title.trim());
}

/** One file as it goes into the archive, and what was done to it on the way. */
export interface ImportedText {
  text: string;
  /** Its title was only in its name, and has been put in as the first line. */
  titled: boolean;
  /** Nothing in the file but its title, which is how he jots an idea. */
  empty: boolean;
}

/**
 * A raw file's text in b-notes' shape.
 *
 * @param stem the file's name without its extension, escapes and all.
 * @param source what is in the file.
 */
export function importedText(stem: string, source: string): ImportedText {
  const body = source.replaceAll('\r\n', '\n');
  const title = titleOfResophName(stem);
  // As an empty Resoph file is shown: the title, with nothing under it.
  if (body.trim().length === 0) return { text: `${title}\n\n`, titled: false, empty: true };
  const firstLine = body.split('\n').find((line) => line.trim().length > 0) ?? '';
  if (opensWithTitle(firstLine, title)) return { text: body, titled: false, empty: false };
  return { text: `${title}\n\n${body}`, titled: true, empty: false };
}

/** What an import leaves behind in `IMPORT_RECORD`. */
export interface ImportRecord {
  importedAt: number;
  sources: number;
  written: number;
  titled: number;
  empty: number;
  skipped: number;
  /** The files that could not be imported, by name. */
  failed: string[];
}

/** Read back, and trusted only as far as it checks out: it is a file anyone could edit. */
function recordFrom(text: string): ImportRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // A record that is not JSON is still a record: the folder is done. Only
    // its numbers are lost, and the caller shows it without them.
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const held = parsed as Record<string, unknown>;
  const count = (key: string): number | null => {
    const value = held[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };
  const failed = held['failed'];
  const numbers = ['importedAt', 'sources', 'written', 'titled', 'empty', 'skipped'].map(count);
  if (numbers.some((value) => value === null)) return null;
  if (!Array.isArray(failed) || !failed.every((name) => typeof name === 'string')) return null;
  const [importedAt, sources, written, titled, empty, skipped] = numbers as number[];
  return {
    importedAt: importedAt ?? 0,
    sources: sources ?? 0,
    written: written ?? 0,
    titled: titled ?? 0,
    empty: empty ?? 0,
    skipped: skipped ?? 0,
    failed: failed as string[],
  };
}

/** Where one raw folder stands. */
export type RawArchiveState =
  | { kind: 'new' }
  | { kind: 'partial'; present: number }
  /** The record is null when it is there but cannot be read. */
  | { kind: 'done'; record: ImportRecord | null };

export interface RawArchive {
  name: string;
  /** The `.md` and `.txt` files in it. */
  sources: number;
  state: RawArchiveState;
}

export interface RawArchives {
  /** `Arhiva-raw` as a path, to tell whoever is setting up where to put things. */
  where: string;
  /** Whether `Arhiva-raw` is there at all. */
  present: boolean;
  archives: RawArchive[];
}

/** Which file each source goes into: its own name, as `.txt`. */
interface Planned {
  source: FileInfo;
  stem: string;
  output: string;
}

const nameOf = (path: string): string => path.split('/').at(-1) ?? path;

/*
  In name order, so the same folder always gives the same names, and an
  import that stopped part-way picks up where it was. Two sources that would
  land on one name — `X.md` and `X.txt`, or `X` and `x`, which Windows takes
  for one file — are told apart as the app tells texts apart, `X 2`.
*/
function planned(sources: readonly FileInfo[]): Planned[] {
  const taken = new Set<string>();
  return [...sources]
    .sort((first, second) => (first.path < second.path ? -1 : first.path > second.path ? 1 : 0))
    .map((source) => {
      const stem = nameOf(source.path).replace(SOURCE, '');
      let id = stem;
      for (let count = 2; taken.has(id.toLowerCase()); count += 1) id = `${stem} ${count}`;
      taken.add(id.toLowerCase());
      return { source, stem, output: `${id}${EXTENSION}` };
    });
}

/**
 * The raw folders, and how far each has got.
 *
 * @param folder b-notes' own folder, which holds both `Arhiva` and `Arhiva-raw`.
 */
export function createArchiveImport(files: FileSystem, folder: string, log: Log) {
  const at = (...parts: string[]): string => [folder, ...parts].join('/');

  /** A folder's files, or none where it was never made. */
  async function filesIn(where: string): Promise<FileInfo[]> {
    try {
      return await files.list(where);
    } catch (failure: unknown) {
      if (!(failure instanceof FolderMissing)) throw failure;
      return [];
    }
  }

  async function sourcesOf(name: string): Promise<FileInfo[]> {
    return (await filesIn(at(RAW_ARCHIVE_FOLDER, name))).filter((file) => SOURCE.test(nameOf(file.path)));
  }

  /** The record, if the folder has one: null inside when it cannot be read. */
  async function recordIn(name: string): Promise<{ record: ImportRecord | null } | null> {
    try {
      return { record: recordFrom(await files.read(at(ARCHIVE_FOLDER, name, IMPORT_RECORD))) };
    } catch (failure: unknown) {
      if (failure instanceof FileMissing) return null;
      throw failure;
    }
  }

  /** One file, into the record. Null when it went in, or why it did not. */
  async function importFile(name: string, each: Planned, record: ImportRecord): Promise<string | null> {
    const file = nameOf(each.source.path);
    try {
      const read = await files.readStrict(each.source.path);
      if (read.kind === 'not-utf8') {
        log.warn('A raw archive file is not UTF-8, and was not imported', { name, file });
        return 'not UTF-8';
      }
      const imported = importedText(each.stem, read.text);
      // With the date it had, so the archive shows when it was written, not when it was imported.
      await files.write(at(ARCHIVE_FOLDER, name, each.output), imported.text, each.source.updatedAt);
      record.written += 1;
      if (imported.titled) record.titled += 1;
      if (imported.empty) record.empty += 1;
      return null;
    } catch (failure: unknown) {
      log.error('Could not import a raw archive file', { name, file, failure: describeError(failure) });
      return failure instanceof Error ? failure.message : String(failure);
    }
  }

  async function stateOf(name: string, plan: readonly Planned[]): Promise<RawArchiveState> {
    const done = await recordIn(name);
    if (done !== null) return { kind: 'done', record: done.record };
    const there = new Set((await filesIn(at(ARCHIVE_FOLDER, name))).map((file) => nameOf(file.path).toLowerCase()));
    const present = plan.filter((each) => there.has(each.output.toLowerCase())).length;
    return present === 0 ? { kind: 'new' } : { kind: 'partial', present };
  }

  return {
    async survey(): Promise<RawArchives> {
      const where = at(RAW_ARCHIVE_FOLDER).replaceAll('/', '\\');
      let names: string[];
      try {
        names = await files.listFolders(at(RAW_ARCHIVE_FOLDER));
      } catch (failure: unknown) {
        if (!(failure instanceof FolderMissing)) throw failure;
        return { where, present: false, archives: [] };
      }
      const archives: RawArchive[] = [];
      for (const name of names.sort()) {
        const plan = planned(await sourcesOf(name));
        archives.push({ name, sources: plan.length, state: await stateOf(name, plan) });
      }
      return { where, present: true, archives };
    },

    /**
     * Imports one raw folder into `Arhiva/<name>`, unless that has been done.
     *
     * One file failing does not stop the rest: it is said, logged, and listed
     * in the record. The record is written once every file has been tried, so
     * an import that is interrupted is carried on by the next one.
     *
     * @param say one line at a time for whoever is watching.
     * @returns what happened, or null when the folder had been imported already.
     */
    async importOne(name: string, say: (line: string) => void): Promise<ImportRecord | null> {
      if ((await recordIn(name)) !== null) {
        say(`${name}: imported already, left as it is.`);
        return null;
      }
      const plan = planned(await sourcesOf(name));
      const there = new Set((await filesIn(at(ARCHIVE_FOLDER, name))).map((file) => nameOf(file.path).toLowerCase()));
      const record: ImportRecord = {
        importedAt: Date.now(),
        sources: plan.length,
        written: 0,
        titled: 0,
        empty: 0,
        skipped: 0,
        failed: [],
      };
      say(`${name}: importing ${plan.length} files…`);

      for (const [index, each] of plan.entries()) {
        if (index > 0 && index % 100 === 0) say(`  ${index} / ${plan.length}`);
        if (there.has(each.output.toLowerCase())) {
          record.skipped += 1;
          continue;
        }
        const failure = await importFile(name, each, record);
        if (failure === null) continue;
        record.failed.push(nameOf(each.source.path));
        say(`  could not import ${nameOf(each.source.path)}: ${failure}`);
      }

      await files.write(at(ARCHIVE_FOLDER, name, IMPORT_RECORD), `${JSON.stringify(record, null, 2)}\n`);
      say(
        `${name}: ${record.written} written (${record.titled} titles added, ${record.empty} empty), ` +
          `${record.skipped} already there, ${record.failed.length} failed.`,
      );
      if (record.failed.length > 0) {
        say(
          `  To try the failed ones again: fix them in ${at(RAW_ARCHIVE_FOLDER, name).replaceAll('/', '\\')}, ` +
            `delete ${at(ARCHIVE_FOLDER, name).replaceAll('/', '\\')} and import again. ` +
            'Texts he has already brought in from it would come back into the archive.',
        );
      }
      log.info('Imported a raw archive', { name, ...record });
      return record;
    },
  };
}

export type ArchiveImport = ReturnType<typeof createArchiveImport>;
