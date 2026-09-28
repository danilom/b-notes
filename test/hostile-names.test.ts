import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { createFileSystem } from '../src/hosts/electron/disk-file-system.ts';
import { createNoteLibrary } from '../src/notes/note-library.ts';
import { createNoteStore } from '../src/notes/note-store.ts';
import { createResophFolder } from '../src/notes/resoph-folder.ts';
import { resophIdOf, titleOfResophName } from '../src/notes/resoph-note.ts';
import { isStub } from '../src/notes/resoph-stub.ts';
import { silentLog } from './silent-log.ts';

/**
 * Names nobody would choose, on the real disk.
 *
 * His names are adversarial input: 0.7.0 refused a quarter of them, and the
 * tests of the day used only names we thought of. `scripts/replay-saves.mts`
 * runs the ones he has; these are the shapes he could have next — every
 * escape Resoph writes, spaces and dots at the ends, text that looks like our
 * own markers, letters as a Mac writes them.
 */

const NAMING = { machine: 'Test', now: () => new Date(2026, 8, 28, 10, 0, 0) };

async function library(resophFiles: Record<string, string>) {
  const root = await mkdtemp(path.join(tmpdir(), 'b-notes-hostile-'));
  const notes = path.join(root, 'b-notes');
  const resoph = path.join(root, 'ResophNotes');
  await mkdir(notes);
  await mkdir(resoph);
  for (const [name, text] of Object.entries(resophFiles)) await writeFile(path.join(resoph, `${name}.txt`), text);
  const files = createFileSystem(path.join(root, 'staging'));
  const slashed = (dir: string): string => dir.replaceAll(path.sep, '/');
  const log = silentLog();
  const own = createNoteStore(files, slashed(notes), log, () => undefined, NAMING);
  const store = createNoteLibrary(own, createResophFolder(files, slashed(resoph), log), files, slashed(notes), log, () => undefined, NAMING);
  return { store, notes, resoph };
}

/** Names a Resoph file of his could have, without `.txt`. */
const RESOPH_NAMES: Record<string, string> = {
  'spaces at both ends': '          Pismo   ',
  'every escape Resoph writes': '%2A%3F%2F%5C%3A%09%22%3C%3E%7C%25 Znaci',
  'a percent that is not an escape': '100% pa %zz i %2',
  'a trailing dot': 'Kraj.',
  'a trailing dot after spaces': '   Kraj .',
  'only spaces': '     ',
  'nothing at all': '',
  'our own code in it': 'Pismo ~K3F9A2',
  'our own code and number': 'Pismo ~K3F9A2 2',
  'the Resoph mark in it': 'resoph%3APismo',
  'the extension inside': 'Pismo.txt',
  'letters as a Mac writes them': 'Šuma i ćup',
  'Serbian letters as typed': 'Šuma i ćup, đak, Žarko',
  'an emoji': 'Pismo 🌿',
  'right to left': 'Pismo שלום',
  'a hundred characters': `${'Dugacak naslov '.repeat(6)}kraj`.padEnd(100, 'x'),
};

describe('a Resoph name nobody would choose', () => {
  for (const [shape, stem] of Object.entries(RESOPH_NAMES)) {
    it(`is listed, taken over and saved again: ${shape}`, async () => {
      const { store, notes, resoph } = await library({ [stem]: 'Prvi red.' });

      const [listed, ...more] = await store.list();
      assert.equal(more.length, 0, 'listed more than once');
      assert.equal(listed?.id, resophIdOf(stem));
      const shown = await store.read(resophIdOf(stem));
      assert.ok(shown.startsWith(titleOfResophName(stem)), 'not shown with its title first');

      const id = await store.save(resophIdOf(stem), `${shown}\nDopisano.`);
      assert.ok(id !== null);
      assert.equal(await store.save(id, `${shown}\nDopisano. Opet.`), id);
      assert.equal(await store.read(id), `${shown}\nDopisano. Opet.`);
      assert.equal(await readFile(path.join(notes, `${id}.txt`), 'utf8'), `${shown}\nDopisano. Opet.`);
      assert.equal(isStub(await readFile(path.join(resoph, `${stem}.txt`), 'utf8')), true, 'no stub');
      assert.deepEqual((await store.list()).map((note) => note.id), [id]);
    });
  }
});

/** Titles a text of his could open with, moved to Resoph and back into view. */
const MOVED_TITLES: Record<string, string> = {
  'every character Resoph escapes': '*?/\\:"<>|% Znaci',
  'a tab inside': 'Pismo\tdrugo',
  'spaces at both ends': '          Pismo   ',
  'a trailing dot': 'Kraj.',
  'letters as a Mac writes them': 'Šuma',
  'an emoji': 'Pismo 🌿',
};

/** Titles no file of Resoph's can carry, which have to stay in b-notes. */
const KEPT_TITLES: Record<string, string> = {
  'a control character pasted in': 'Pismo\u000Bdrugo',
};

/** A text of b-notes' own opening with `title`, and the attempt to move it. */
async function moving(title: string) {
  const found = await library({});
  const text = `${title}\n\nTekst.`;
  const id = await found.store.save(null, text);
  if (id === null) throw new Error('The text was not written');
  return { ...found, text, id, moved: found.store.moveToResoph(id) };
}

describe('a title nobody would choose, moved to Resoph', () => {
  for (const [shape, title] of Object.entries(MOVED_TITLES)) {
    it(`reads back as it was: ${shape}`, async () => {
      const { store, text, moved } = await moving(title);

      const id = await moved;

      assert.equal(await store.read(id), text);
      assert.deepEqual((await store.list()).map((note) => note.id), [id]);
    });
  }

  for (const [shape, title] of Object.entries(KEPT_TITLES)) {
    it(`stays in b-notes whole, and leaves nothing in Resoph: ${shape}`, async () => {
      const { store, resoph, text, id, moved } = await moving(title);

      await assert.rejects(moved);

      assert.equal(await store.read(id), text);
      assert.deepEqual(await readdir(resoph), []);
    });
  }
});
