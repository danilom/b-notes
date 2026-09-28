import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { createFileSystem } from '../src/hosts/electron/disk-file-system.ts';
import type { NoteHandle } from '../src/notes/note-handle.ts';
import { DELETED_FOLDER, VERSIONS_FOLDER } from '../src/notes/note-naming.ts';
import { isResophId, resophIdOf } from '../src/notes/resoph-note.ts';
import { isStub } from '../src/notes/resoph-stub.ts';
import { type Writing, createWriting } from '../src/notes/writing.ts';
import type { FileSystem } from '../src/platform/file-system.ts';
import { silentLog } from './silent-log.ts';

/**
 * A save interrupted at every step it has, and then let through.
 *
 * A save is several operations on disk — listing, reading, keeping a version,
 * writing, and for a Resoph text a copy, a read-back and a stub — and any of
 * them can fail on his machines: Dropbox holding a file, a drive going to
 * sleep. The retry runs the whole save again from the top. So each case here
 * runs once cleanly to count its operations, then once for each of them with
 * that one failing and a clean retry after, and asks the same questions of the
 * disk every time: are his newest words there, once, and is nothing he had
 * lost.
 */

/** The real disk, with one chosen operation failing the way a held file fails. */
interface Faulty extends FileSystem {
  /** The `nth` operation from now fails, counting from 1. */
  failAt(nth: number): void;
  /** Operations since the last `failAt`, or since the start. */
  readonly count: number;
}

function faulty(real: FileSystem): Faulty {
  let count = 0;
  let failing = 0;
  const step = (): void => {
    count += 1;
    if (count !== failing) return;
    throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
  };
  const wrap =
    <A extends unknown[], R>(operation: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      step();
      return operation(...args);
    };
  return {
    list: wrap(real.list),
    listFolders: wrap(real.listFolders),
    folderExists: wrap(real.folderExists),
    read: wrap(real.read),
    readStrict: wrap(real.readStrict),
    write: wrap(real.write),
    rename: wrap(real.rename),
    removeEmptyFolder: wrap(real.removeEmptyFolder),
    removeEmptyFile: wrap(real.removeEmptyFile),
    removeFile: wrap(real.removeFile),
    failAt(nth: number) {
      count = 0;
      failing = nth;
    },
    get count() {
      return count;
    },
  };
}

/** Held still: a retry here is a flush, never a timer. */
const stillTimers = { set: () => 0, clear: () => undefined };

interface Rig {
  writing: Writing;
  files: Faulty;
  notes: string;
  resoph: string;
  handle: NoteHandle;
}

/**
 * A b-notes folder and a Resoph folder beside it, each holding what it is
 * handed, and the handle of the text called `pick` — or of a new one.
 */
async function rig(
  resophFiles: Record<string, string>,
  ownFiles: Record<string, string>,
  pick: string | null,
): Promise<Rig> {
  const root = await mkdtemp(path.join(tmpdir(), 'b-notes-faults-'));
  const notes = path.join(root, 'b-notes');
  const resoph = path.join(root, 'ResophNotes');
  await mkdir(notes);
  await mkdir(resoph);
  for (const [name, text] of Object.entries(resophFiles)) await writeFile(path.join(resoph, `${name}.txt`), text);
  for (const [name, text] of Object.entries(ownFiles)) await writeFile(path.join(notes, `${name}.txt`), text);

  const files = faulty(createFileSystem(path.join(root, 'staging')));
  const slashed = (dir: string): string => dir.replaceAll(path.sep, '/');
  const writing = createWriting(files, slashed(notes), silentLog(), undefined, stillTimers, {
    resophFolder: slashed(resoph),
    naming: { machine: 'Test', now: () => new Date(2026, 8, 28, 10, 0, 0) },
  });
  const { notes: loaded } = await writing.load();
  const handle = pick === null ? writing.begin() : loaded.find((note) => note.id === pick)?.handle;
  if (handle === undefined) throw new Error(`No text ${pick} to pick`);
  return { writing, files, notes, resoph, handle };
}

/** The `.txt` files directly in a folder, with what each holds. */
async function textsIn(dir: string): Promise<Map<string, string>> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
    throw error;
  }
  const texts = new Map<string, string>();
  for (const name of names.filter((each) => each.endsWith('.txt'))) {
    texts.set(name, await readFile(path.join(dir, name), 'utf8'));
  }
  return texts;
}

/** Every version kept of every text, as the words in it. */
async function everyVersion(notes: string): Promise<string[]> {
  const found: string[] = [];
  for (const folder of [path.join(notes, VERSIONS_FOLDER), path.join(notes, DELETED_FOLDER, VERSIONS_FOLDER)]) {
    let texts: string[];
    try {
      texts = await readdir(folder);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    for (const text of texts) found.push(...(await textsIn(path.join(folder, text))).values());
  }
  return found.map((text) => text.replaceAll('\r\n', '\n'));
}

interface Case {
  /** What he does. May fail part-way; a save's failure is only in `stateOf`. */
  act: (rig: Rig) => Promise<void>;
  /** What he does next once the disk is well: the save's own retry, or trying again. */
  retry: (rig: Rig) => Promise<void>;
  /** What must be true afterwards, whichever operation failed. */
  holds: (rig: Rig) => Promise<void>;
  resoph?: Record<string, string>;
  own?: Record<string, string>;
  pick: string | null;
}

/** Runs a case cleanly to count its steps, then once with each step failing. */
async function everyStepFailing(each: Case): Promise<number> {
  const clean = await rig(each.resoph ?? {}, each.own ?? {}, each.pick);
  clean.files.failAt(0);
  await each.act(clean);
  const steps = clean.files.count;
  await each.holds(clean);

  for (let nth = 1; nth <= steps; nth += 1) {
    const broken = await rig(each.resoph ?? {}, each.own ?? {}, each.pick);
    broken.files.failAt(nth);
    try {
      await each.act(broken);
    } catch {
      // Expected for some steps: deleting says so when it fails, and the
      // question here is only what the disk holds after he tries again.
    }
    broken.files.failAt(0);
    await each.retry(broken);
    try {
      await each.holds(broken);
    } catch (error: unknown) {
      throw new Error(`With operation ${nth} of ${steps} failing: ${(error as Error).message}`, { cause: error });
    }
  }
  return steps;
}

const saveAndFlush = (text: string) => async ({ writing, handle }: Rig): Promise<void> => {
  writing.save(handle, text);
  await writing.flush(handle);
};
const flushAgain = async ({ writing, handle }: Rig): Promise<void> => writing.flush(handle);

/** His ranked, escaped, space-ended name, and the text Resoph shows for it. */
const STEM = '      %2AKILIM ';
const SHOWN = '      *KILIM \n\nPrvi red.';
const EDITED = `${SHOWN}\nDopisano.`;

/** The one text in his list, and that it is b-notes' own and holds `words`. */
async function oneTextHolding({ writing, handle, notes }: Rig, words: string): Promise<void> {
  assert.equal(writing.stateOf(handle).waiting, false, 'his words are still waiting');
  const listed = await writing.list();
  assert.deepEqual(listed.map((note) => note.id), [writing.tokenOf(handle)], 'not listed once, as his text');
  assert.deepEqual([...(await textsIn(notes)).values()], [words], "b-notes' folder does not hold his words once");
}

async function resophHoldsAStub({ resoph }: Rig): Promise<void> {
  const there = await readFile(path.join(resoph, `${STEM}.txt`), 'utf8');
  assert.equal(isStub(there), true, 'the Resoph file is not a stub');
}

describe('a save failing at any one of its steps, then let through', () => {
  it('takes a Resoph text over once, into one copy, keeping what Resoph had', async () => {
    const steps = await everyStepFailing({
      resoph: { [STEM]: 'Prvi red.' },
      pick: resophIdOf(STEM),
      act: saveAndFlush(EDITED),
      retry: flushAgain,
      async holds(rig) {
        assert.equal(isResophId(rig.writing.tokenOf(rig.handle) ?? ''), false, 'still held as a Resoph text');
        await oneTextHolding(rig, EDITED);
        await resophHoldsAStub(rig);
        assert.ok((await everyVersion(rig.notes)).includes(SHOWN), 'what Resoph had was not kept');
      },
    });
    assert.ok(steps > 5, `only ${steps} steps counted`);
  });

  it('writes a text of its own over what it had', async () => {
    await everyStepFailing({
      own: { 'Pismo ~ABC123': 'Pismo\n\nStaro.' },
      pick: 'Pismo ~ABC123',
      act: saveAndFlush('Pismo\n\nNovo.'),
      retry: flushAgain,
      holds: (rig) => oneTextHolding(rig, 'Pismo\n\nNovo.'),
    });
  });

  it('empties a text only with what it said kept', async () => {
    await everyStepFailing({
      own: { 'Pismo ~ABC123': 'Pismo\n\nSve sto je pisalo.' },
      pick: 'Pismo ~ABC123',
      act: saveAndFlush(''),
      retry: flushAgain,
      async holds(rig) {
        await oneTextHolding(rig, '');
        assert.ok((await everyVersion(rig.notes)).includes('Pismo\n\nSve sto je pisalo.'), 'the emptied words were not kept');
      },
    });
  });

  it('keeps what another machine wrote meanwhile before writing his words over it', async () => {
    await everyStepFailing({
      own: { 'Pismo ~ABC123': 'Pismo\n\nStaro.' },
      pick: 'Pismo ~ABC123',
      async act(rig) {
        await writeFile(path.join(rig.notes, 'Pismo ~ABC123.txt'), 'Pismo\n\nS drugog racunara.');
        await saveAndFlush('Pismo\n\nNovo.')(rig);
      },
      retry: flushAgain,
      async holds(rig) {
        await oneTextHolding(rig, 'Pismo\n\nNovo.');
        assert.ok((await everyVersion(rig.notes)).includes('Pismo\n\nS drugog racunara.'), "the other machine's words were not kept");
      },
    });
  });

  it('writes a new text into one file', async () => {
    await everyStepFailing({
      pick: null,
      act: saveAndFlush('Novo\n\nTekst.'),
      retry: flushAgain,
      holds: (rig) => oneTextHolding(rig, 'Novo\n\nTekst.'),
    });
  });
});

describe('deleting failing at any one of its steps, then asked again', () => {
  /** Once more if it is still there, as he would press it again. */
  const again = async ({ writing, handle }: Rig): Promise<void> => {
    if (writing.tokenOf(handle) !== null) await writing.discard(handle);
  };

  async function putAwayOnce({ writing, notes }: Rig, words: string): Promise<void> {
    assert.deepEqual(await writing.list(), [], 'still in his list');
    assert.deepEqual([...(await textsIn(notes)).values()], [], "still in b-notes' folder");
    assert.deepEqual([...(await textsIn(path.join(notes, DELETED_FOLDER))).values()], [words], 'not in Obrisano once');
  }

  it('puts a Resoph text away once, and leaves a stub', async () => {
    await everyStepFailing({
      resoph: { [STEM]: 'Prvi red.' },
      pick: resophIdOf(STEM),
      act: async ({ writing, handle }) => writing.discard(handle),
      retry: again,
      async holds(rig) {
        await putAwayOnce(rig, SHOWN);
        await resophHoldsAStub(rig);
      },
    });
  });

  it('puts a text of its own away once', async () => {
    await everyStepFailing({
      own: { 'Pismo ~ABC123': 'Pismo\n\nTekst.' },
      pick: 'Pismo ~ABC123',
      act: async ({ writing, handle }) => writing.discard(handle),
      retry: again,
      holds: (rig) => putAwayOnce(rig, 'Pismo\n\nTekst.'),
    });
  });
});
