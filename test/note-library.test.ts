import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { createFileSystem } from '../src/hosts/electron/disk-file-system.ts';
import { FROM_RESOPH, createNoteLibrary } from '../src/notes/note-library.ts';
import { DELETED_FOLDER, RESOPH_LINKS_FOLDER, VERSIONS_FOLDER, copyNameFor } from '../src/notes/note-naming.ts';
import { createNoteStore } from '../src/notes/note-store.ts';
import { createResophFolder } from '../src/notes/resoph-folder.ts';
import { resophIdOf } from '../src/notes/resoph-note.ts';
import { silentLog } from './silent-log.ts';

const NAMING = { machine: 'Test', now: () => new Date(2026, 8, 27, 10, 0, 0) };
const slashed = (dir: string): string => dir.replaceAll('\\', '/');

/**
 * A b-notes folder and a Resoph folder beside it, on the real filesystem, with
 * the Resoph folder holding what it is handed — name on disk to file content,
 * exactly as Resoph writes them: title in the name, the rest in the file.
 */
async function library(resophFiles: Record<string, string> = {}, options: { resoph?: boolean } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'b-notes-library-'));
  const notes = path.join(root, 'b-notes');
  const resoph = path.join(root, 'ResophNotes');
  await mkdir(notes);
  if (options.resoph !== false) {
    await mkdir(resoph);
    for (const [name, text] of Object.entries(resophFiles)) {
      await writeFile(path.join(resoph, `${name}.txt`), text, 'utf8');
    }
  }
  const renames: [string, string][] = [];
  const files = createFileSystem(path.join(tmpdir(), 'b-notes-staging'));
  const log = silentLog();
  const renamed = (from: string, to: string): void => {
    renames.push([from, to]);
  };
  const own = createNoteStore(files, slashed(notes), log, renamed, NAMING);
  const store = createNoteLibrary(own, createResophFolder(files, slashed(resoph), log), files, slashed(notes), log, renamed);
  return { root, notes, resoph, store, renames };
}

/** Every file under a folder, with what it holds, so "nothing changed" can be checked. */
async function everything(dir: string): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const at = path.join(entry.parentPath, entry.name);
    found[path.relative(dir, at)] = `${(await stat(at)).mtimeMs}|${await readFile(at, 'utf8')}`;
  }
  return found;
}

const RANKED = '                %2AGRAD Kilim';

describe('texts still only in Resoph', () => {
  it('are listed beside his b-notes texts, titled as Resoph shows them', async () => {
    const { store } = await library({ [RANKED]: 'Prvi red.\r\nDrugi.' });
    await store.save(null, 'Pismo\n\nNovo.');

    const titles = (await store.list()).map((note) => note.title).sort();

    assert.deepEqual(titles, ['*GRAD Kilim', 'Pismo']);
  });

  it('read as the title and then the file, spaces and escapes read back', async () => {
    const { store } = await library({ [RANKED]: 'Prvi red.\r\nDrugi.' });

    assert.equal(await store.read(resophIdOf(RANKED)), '                *GRAD Kilim\n\nPrvi red.\nDrugi.');
  });

  it('keep the spaces he ranks them by, and rank by them', async () => {
    const { store } = await library({ [RANKED]: 'Tekst.' });

    const [note] = await store.list();

    assert.equal(note?.sortTitle, '                *GRAD Kilim');
    assert.equal(note?.rank, 2);
  });

  it('show an empty file as the idea it is: a title with nothing under it', async () => {
    const { store } = await library({ 'Osa i staklo': '' });

    assert.equal(await store.read(resophIdOf('Osa i staklo')), 'Osa i staklo\n\n');
  });

  it('have nothing kept of them yet', async () => {
    const { store } = await library({ Pismo: 'Tekst.' });

    assert.equal(await store.countVersions(resophIdOf('Pismo')), 0);
    assert.deepEqual(await store.listVersions(resophIdOf('Pismo')), []);
  });

  it('show what Resoph changed, the next time they are listed', async () => {
    const { store, resoph } = await library({ Pismo: 'Staro.' });
    await store.list();

    await writeFile(path.join(resoph, 'Pismo.txt'), 'Novo, duze nego prije.', 'utf8');

    assert.equal((await store.list())[0]?.text, 'Pismo\n\nNovo, duze nego prije.');
  });

  it('leave only his own texts when there is no Resoph folder', async () => {
    const { store } = await library({}, { resoph: false });
    await store.save(null, 'Pismo\n\nNovo.');

    assert.deepEqual((await store.list()).map((note) => note.title), ['Pismo']);
  });
});

describe('the first time he changes a Resoph text', () => {
  it('saves his change into a copy of b-notes own, named from the Resoph file', async () => {
    const { store, notes } = await library({ [RANKED]: 'Prvi red.' });

    const id = await store.save(resophIdOf(RANKED), '                *GRAD Kilim\nPrvi red, bolji.');

    assert.equal(id, copyNameFor(RANKED));
    assert.equal(
      await readFile(path.join(notes, `${copyNameFor(RANKED)}.txt`), 'utf8'),
      '                *GRAD Kilim\nPrvi red, bolji.',
    );
  });

  it('keeps what Resoph had as a version, labelled as coming from Resoph', async () => {
    const { store } = await library({ Pismo: 'Prvi red.' });

    const id = await store.save(resophIdOf('Pismo'), 'Pismo\nNesto sasvim drugo.');

    const [version] = await store.listVersions(id ?? '');
    assert.equal(version?.text, 'Pismo\n\nPrvi red.');
    assert.ok(version?.id.endsWith(` ${FROM_RESOPH}`), version?.id);
  });

  it('writes down which Resoph file the copy came from', async () => {
    const { store, notes } = await library({ [RANKED]: 'Tekst.' });

    await store.save(resophIdOf(RANKED), 'Izmijenjeno.');

    assert.equal(
      await readFile(path.join(notes, RESOPH_LINKS_FOLDER, `${copyNameFor(RANKED)}.txt`), 'utf8'),
      RANKED,
    );
  });

  it('says the text is now held under the copy name', async () => {
    const { store, renames } = await library({ Pismo: 'Tekst.' });

    await store.save(resophIdOf('Pismo'), 'Pismo\nIzmijenjeno.');

    assert.deepEqual(renames, [[resophIdOf('Pismo'), copyNameFor('Pismo')]]);
  });

  it('lists the text once, as the copy, from then on', async () => {
    const { store } = await library({ Pismo: 'Tekst.', Zima: 'Snijeg.' });

    await store.save(resophIdOf('Pismo'), 'Pismo\nIzmijenjeno.');

    const listed = (await store.list()).map((note) => note.id).sort();
    assert.deepEqual(listed, [copyNameFor('Pismo'), resophIdOf('Zima')].sort());
  });

  it('writes to the same copy when the same Resoph text is changed again', async () => {
    const { store, notes } = await library({ Pismo: 'Tekst.' });

    await store.save(resophIdOf('Pismo'), 'Pismo\nPrvo.');
    await store.save(resophIdOf('Pismo'), 'Pismo\nDrugo.');

    assert.equal(await readFile(path.join(notes, `${copyNameFor('Pismo')}.txt`), 'utf8'), 'Pismo\nDrugo.');
    assert.equal((await store.listVersions(copyNameFor('Pismo'))).length, 1);
  });

  it('gives the same copy the same name on every machine, so two offline machines write one file', async () => {
    const dell = await library({ '   Pismo': 'Tekst.' });
    const asus = await library({ '   Pismo': 'Tekst.' });

    assert.equal(
      await dell.store.save(resophIdOf('   Pismo'), 'Na Dellu.'),
      await asus.store.save(resophIdOf('   Pismo'), 'Na Asusu.'),
    );
  });

  it('keeps his spacing variants as two texts, though they read the same', async () => {
    const { store } = await library({ Pismo: 'Jedan.', '        Pismo': 'Drugi.' });

    const first = await store.save(resophIdOf('Pismo'), 'Pismo\nJedan, izmijenjen.');
    const second = await store.save(resophIdOf('        Pismo'), '        Pismo\nDrugi, izmijenjen.');

    assert.notEqual(first, second);
    assert.equal((await store.list()).length, 2);
  });
});

describe('what b-notes does to Resoph folder', () => {
  it('nothing at all: not a save, a kept copy, a delete, a restore or a destroy', async () => {
    const { store, resoph } = await library({ Pismo: 'Tekst.', [RANKED]: 'Rangiran.', Zima: 'Snijeg.' });
    const before = await everything(resoph);

    await store.save(resophIdOf('Pismo'), 'Pismo\nIzmijenjeno.');
    await store.keepCopy(resophIdOf(RANKED), 'Nesto.');
    await store.moveToDeleted(resophIdOf('Zima'));
    await store.restore(copyNameFor('Zima'));
    await store.moveToDeleted(copyNameFor('Zima'));
    await store.destroy(copyNameFor('Zima'));
    await store.list();

    assert.deepEqual(await everything(resoph), before);
  });
});

describe('putting away a Resoph text', () => {
  it('puts away b-notes copy of it, and the Resoph original leaves his list', async () => {
    const { store, notes } = await library({ Zima: 'Snijeg.' });

    await store.moveToDeleted(resophIdOf('Zima'));

    assert.deepEqual(await store.list(), []);
    assert.deepEqual(
      (await readdir(path.join(notes, DELETED_FOLDER))).sort(),
      [`${copyNameFor('Zima')}.txt`, VERSIONS_FOLDER].sort(),
    );
    assert.deepEqual((await store.listDeleted()).map((note) => note.text), ['Zima\n\nSnijeg.']);
  });

  it('comes back as the copy, once only', async () => {
    const { store } = await library({ Zima: 'Snijeg.' });
    await store.moveToDeleted(resophIdOf('Zima'));

    await store.restore(copyNameFor('Zima'));

    assert.deepEqual((await store.list()).map((note) => note.id), [copyNameFor('Zima')]);
  });

  it('stays gone once destroyed, though the Resoph file is still there', async () => {
    // The link outlives the copy. Without it, the text he destroyed would
    // walk back into his list from Resoph's folder.
    const { store } = await library({ Zima: 'Snijeg.' });
    await store.moveToDeleted(resophIdOf('Zima'));

    await store.destroy(copyNameFor('Zima'));

    assert.deepEqual(await store.list(), []);
  });

  it('shows the text again if its link was lost, rather than hiding it', async () => {
    // Untidy is allowed; hidden is not.
    const { store, notes } = await library({ Zima: 'Snijeg.' });
    await store.moveToDeleted(resophIdOf('Zima'));
    await store.destroy(copyNameFor('Zima'));

    await rm(path.join(notes, RESOPH_LINKS_FOLDER), { recursive: true });

    assert.deepEqual((await store.list()).map((note) => note.id), [resophIdOf('Zima')]);
  });
});

describe('keeping a copy of a Resoph text', () => {
  it('makes the text b-notes own first, then keeps the copy', async () => {
    const { store } = await library({ Pismo: 'Tekst.' });

    await store.keepCopy(resophIdOf('Pismo'), 'Pismo\nIz editora.');

    const versions = await store.listVersions(copyNameFor('Pismo'));
    assert.deepEqual(versions.map((version) => version.text).sort(), ['Pismo\n\nTekst.', 'Pismo\nIz editora.']);
  });
});

describe('dates', () => {
  it('lists a Resoph text by when Resoph last wrote it', async () => {
    const { store, resoph } = await library({ Staro: 'Davno.', Novo: 'Juce.' });
    const longAgo = new Date(2019, 0, 1);
    await utimes(path.join(resoph, 'Staro.txt'), longAgo, longAgo);

    assert.deepEqual((await store.list()).map((note) => note.title), ['Novo', 'Staro']);
  });
});

/** Rewrites a Resoph file the way Resoph would, dated `when`. */
async function resophWrites(resoph: string, name: string, text: string, when: Date): Promise<void> {
  await writeFile(path.join(resoph, `${name}.txt`), text, 'utf8');
  await utimes(path.join(resoph, `${name}.txt`), when, when);
}

const LATER = new Date(Date.now() + 60 * 60_000);
const EARLIER = new Date(Date.now() - 60 * 60_000);

describe('a change made in Resoph to a text b-notes has copied', () => {
  it('becomes the text, when he has not changed it in b-notes since', async () => {
    const { store, resoph } = await library({ Pismo: 'Prvo.' });
    // Taken in by keeping a copy, which leaves the text as Resoph had it.
    await store.keepCopy(resophIdOf('Pismo'), 'Pismo\n\nPrvo.');

    await resophWrites(resoph, 'Pismo', 'Drugo, napisano u Resophu.', LATER);

    const [note] = await store.list();
    assert.equal(note?.text, 'Pismo\n\nDrugo, napisano u Resophu.');
    assert.equal(note?.changedInBoth, undefined);
  });

  it('is kept as a version either way, labelled as from Resoph', async () => {
    const { store, resoph } = await library({ Pismo: 'Prvo.' });
    await store.keepCopy(resophIdOf('Pismo'), 'Pismo\n\nPrvo.');

    await resophWrites(resoph, 'Pismo', 'Drugo.', LATER);
    await store.list();

    const fromResoph = (await store.listVersions(copyNameFor('Pismo'))).filter((version) =>
      version.id.includes(FROM_RESOPH),
    );
    assert.deepEqual(fromResoph.map((version) => version.text), ['Pismo\n\nDrugo.', 'Pismo\n\nPrvo.']);
  });

  it('is not news when it is something b-notes has already seen, however it came back', async () => {
    // Another machine's Resoph putting the old version back must not roll his
    // b-notes text back to it.
    const { store, resoph } = await library({ Pismo: 'Prvo.' });
    await store.save(resophIdOf('Pismo'), 'Pismo\nPrvo, pa dopisano u b-notes.');

    await resophWrites(resoph, 'Pismo', 'Prvo.', LATER);

    const [note] = await store.list();
    assert.equal(note?.text, 'Pismo\nPrvo, pa dopisano u b-notes.');
    assert.equal(note?.changedInBoth, undefined);
  });

  it('when both changed, makes the newer one the text and keeps the other', async () => {
    const { store, resoph } = await library({ Pismo: 'Prvo.' });
    await store.save(resophIdOf('Pismo'), 'Pismo\nPrvo, dopisano u b-notes.');

    await resophWrites(resoph, 'Pismo', 'Prvo, dopisano u Resophu.', LATER);

    const [note] = await store.list();
    assert.equal(note?.text, 'Pismo\n\nPrvo, dopisano u Resophu.');
    const kept = (await store.listVersions(copyNameFor('Pismo'))).map((version) => version.text);
    assert.ok(kept.includes('Pismo\nPrvo, dopisano u b-notes.'), 'b-notes version was not kept');
  });

  it('when both changed and b-notes is newer, keeps b-notes and Resoph beside it', async () => {
    const { store, resoph } = await library({ Pismo: 'Prvo.' });
    await store.save(resophIdOf('Pismo'), 'Pismo\nPrvo, dopisano u b-notes.');

    await resophWrites(resoph, 'Pismo', 'Prvo, dopisano u Resophu.', EARLIER);

    const [note] = await store.list();
    assert.equal(note?.text, 'Pismo\nPrvo, dopisano u b-notes.');
    const kept = (await store.listVersions(copyNameFor('Pismo'))).map((version) => version.text);
    assert.ok(kept.includes('Pismo\n\nPrvo, dopisano u Resophu.'), 'the Resoph version was not kept');
  });

  it('says so when both changed, until he has looked', async () => {
    const { store, resoph } = await library({ Pismo: 'Prvo.' });
    await store.save(resophIdOf('Pismo'), 'Pismo\nPrvo, dopisano u b-notes.');
    await resophWrites(resoph, 'Pismo', 'Prvo, dopisano u Resophu.', LATER);

    assert.equal((await store.list())[0]?.changedInBoth, true);

    await store.seenChangedInBoth(copyNameFor('Pismo'));

    assert.equal((await store.list())[0]?.changedInBoth, undefined);
  });

  it('still leaves Resoph folder untouched', async () => {
    const { store, resoph } = await library({ Pismo: 'Prvo.' });
    await store.save(resophIdOf('Pismo'), 'Pismo\nPrvo, dopisano u b-notes.');
    await resophWrites(resoph, 'Pismo', 'Prvo, dopisano u Resophu.', LATER);
    const before = await everything(resoph);

    await store.list();
    await store.seenChangedInBoth(copyNameFor('Pismo'));

    assert.deepEqual(await everything(resoph), before);
  });
});
