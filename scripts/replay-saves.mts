/**
 * Does every one of his Resoph names survive being written in b-notes?
 *
 * 0.7.0 refused a quarter of his names at save time, and nothing we had run
 * used his names: the tests used ones we thought of. This takes every text in
 * a Resoph folder through the same queue the app saves with, on the real
 * filesystem — the first edit that takes it over, a second edit to the copy,
 * emptying some and deleting others — and then checks the disk.
 *
 *   node scripts/replay-saves.mts [Resoph folder] [--names]
 *
 * With no folder, `testdata/real-redacted`. It works on a copy in the temp
 * folder and never writes the folder it is given. Prints counts and the
 * positions of failures; `--names` adds the names, which are his titles, so
 * only on this machine.
 */
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createFileSystem } from '../src/hosts/electron/disk-file-system.ts';
import { EXTENSION, VERSIONS_FOLDER, DELETED_FOLDER } from '../src/notes/note-naming.ts';
import type { NoteHandle } from '../src/notes/note-handle.ts';
import { isResophId } from '../src/notes/resoph-note.ts';
import { isStub } from '../src/notes/resoph-stub.ts';
import { createWriting } from '../src/notes/writing.ts';
import type { Log } from '../src/platform/logging.ts';

const args = process.argv.slice(2);
const showNames = args.includes('--names');
const source = args.find((arg) => !arg.startsWith('--')) ?? 'testdata/real-redacted';
const slashed = (dir: string): string => dir.replaceAll('\\', '/');

const root = await mkdtemp(path.join(tmpdir(), 'b-notes-replay-'));
const resoph = path.join(root, 'ResophNotes');
const notes = path.join(root, 'b-notes');
await mkdir(resoph);
for (const entry of await readdir(source, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith(EXTENSION)) {
    await copyFile(path.join(source, entry.name), path.join(resoph, entry.name));
  }
}

const errors: string[] = [];
const log: Log = {
  info: () => undefined,
  warn: () => undefined,
  error: (message, detail) => errors.push(`${message} ${JSON.stringify(detail)}`),
};
const writing = createWriting(createFileSystem(path.join(root, 'staging')), slashed(notes), log, undefined, undefined, {
  resophFolder: slashed(resoph),
  naming: { machine: 'Replay', now: () => new Date() },
});

type Fate = 'edited' | 'emptied' | 'deleted';
interface Replayed {
  index: number;
  stem: string;
  handle: NoteHandle;
  fate: Fate;
  expected: string;
}

const failures: string[] = [];
/** How long each save took, in the order they ran, so a save that slows as the folder fills shows. */
const timings: { takeOver: number; ordinary: number }[] = [];
const fail = (index: number, stem: string, what: string): void => {
  failures.push(`  #${index} (name ${stem.length} chars): ${what}${showNames ? ` — ${JSON.stringify(stem)}` : ''}`);
};

/** Every seventh deleted, every tenth emptied, the rest edited twice. */
const fateOf = (index: number): Fate => (index % 7 === 3 ? 'deleted' : index % 10 === 5 ? 'emptied' : 'edited');

async function replay(index: number, stem: string, handle: NoteHandle, text: string): Promise<Replayed> {
  const fate = fateOf(index);
  if (fate === 'deleted') {
    await writing.discard(handle);
    return { index, stem, handle, fate, expected: text };
  }
  const first = `${text}\nDopisano.`;
  const before = performance.now();
  writing.save(handle, first);
  await writing.flush(handle);
  const between = performance.now();
  const second = fate === 'emptied' ? '' : `${first} Opet.`;
  writing.save(handle, second);
  await writing.flush(handle);
  timings.push({ takeOver: between - before, ordinary: performance.now() - between });
  if (writing.stateOf(handle).waiting) fail(index, stem, 'still waiting to be written');
  return { index, stem, handle, fate, expected: second };
}

const started = performance.now();
const { notes: loaded } = await writing.load();
const fromResoph = loaded.filter((note) => isResophId(note.id));
const replayed: Replayed[] = [];
for (const [index, note] of fromResoph.entries()) {
  const stem = note.id.slice('resoph:'.length);
  try {
    replayed.push(await replay(index, stem, note.handle, note.text));
  } catch (error: unknown) {
    fail(index, stem, `threw: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
  }
}
const replayMs = Math.round(performance.now() - started);

/** What is at a path, or null. Read straight off the disk, not through the app. */
async function onDisk(at: string): Promise<string | null> {
  try {
    return await readFile(at, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/** The names in a folder, or none where the folder was never made. */
async function namesIn(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function check(each: Replayed): Promise<void> {
  const { index, stem, handle, fate, expected } = each;
  const stub = await onDisk(path.join(resoph, `${stem}${EXTENSION}`));
  if (stub === null || !isStub(stub)) fail(index, stem, 'no stub in the Resoph file');

  const token = writing.tokenOf(handle);
  if (fate === 'deleted') return;
  if (token === null || isResophId(token)) {
    fail(index, stem, `still held as ${token === null ? 'nothing' : 'a Resoph text'}`);
    return;
  }
  const written = await onDisk(path.join(notes, `${token}${EXTENSION}`));
  if (written !== expected) fail(index, stem, `the copy holds ${written === null ? 'nothing' : `${written.length} chars, not ${expected.length}`}`);
  // One kept as Resoph had it when it was taken over, one of his words before
  // the emptying landed.
  const kept = await namesIn(path.join(notes, VERSIONS_FOLDER, token));
  if (fate === 'emptied' && kept.length !== 2) fail(index, stem, `emptied with ${kept.length} versions kept, not 2`);
}

for (const each of replayed) await check(each);

const byFate = (fate: Fate): number => replayed.filter((each) => each.fate === fate).length;
const liveFiles = (await readdir(notes)).filter((name) => name.endsWith(EXTENSION));
const deletedFiles = (await namesIn(path.join(notes, DELETED_FOLDER))).filter((name) => name.endsWith(EXTENSION));
if (liveFiles.length !== byFate('edited') + byFate('emptied')) {
  failures.push(`  ${liveFiles.length} texts in b-notes' folder, for ${byFate('edited') + byFate('emptied')} edited`);
}
if (deletedFiles.length !== byFate('deleted')) {
  failures.push(`  ${deletedFiles.length} texts in Obrisano, for ${byFate('deleted')} deleted`);
}
const stillListed = (await writing.list()).filter((note) => isResophId(note.id));
if (stillListed.length !== 0) failures.push(`  ${stillListed.length} texts still listed from Resoph`);

writing.stop();
console.log(
  `${fromResoph.length} Resoph texts in ${replayMs}ms: ${byFate('edited')} edited twice, ` +
    `${byFate('emptied')} emptied, ${byFate('deleted')} deleted`,
);
const average = (from: number, to: number, kind: 'takeOver' | 'ordinary'): number => {
  const slice = timings.slice(from, to);
  return Math.round(slice.reduce((sum, each) => sum + each[kind], 0) / Math.max(slice.length, 1));
};
console.log(
  `taking over: ${average(0, 100, 'takeOver')}ms each at first, ${average(-100, timings.length, 'takeOver')}ms at the end; ` +
    `an ordinary save: ${average(0, 100, 'ordinary')}ms, then ${average(-100, timings.length, 'ordinary')}ms`,
);
console.log(`${failures.length} failures, ${errors.length} errors logged`);
for (const line of failures) console.log(line);
for (const line of errors.slice(0, 20)) console.log(`  logged: ${showNames ? line : line.slice(0, 60)}`);
await rm(root, { recursive: true, force: true });
process.exitCode = failures.length + errors.length === 0 ? 0 : 1;
