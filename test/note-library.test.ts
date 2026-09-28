import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { createFileSystem } from '../src/hosts/electron/disk-file-system.ts';
import { FROM_RESOPH, ResophMoveRefused, createNoteLibrary } from '../src/notes/note-library.ts';
import { DELETED_FOLDER, VERSIONS_FOLDER, copyNameFor } from '../src/notes/note-naming.ts';
import { createNoteStore } from '../src/notes/note-store.ts';
import { createResophFolder } from '../src/notes/resoph-folder.ts';
import { resophIdOf } from '../src/notes/resoph-note.ts';
import { type StubKind, isStub, stubText } from '../src/notes/resoph-stub.ts';
import { silentLog } from './silent-log.ts';

const NAMING = { machine: 'Test', now: () => new Date(2026, 8, 27, 10, 0, 0) };
const slashed = (dir: string): string => dir.replaceAll('\\', '/');

/**
 * A b-notes folder and a Resoph folder beside it, on the real filesystem, with
 * the Resoph folder holding what it is handed — name on disk to file content,
 * exactly as Resoph writes them: title in the name, the rest in the file.
 */
async function library(
  resophFiles: Record<string, string> = {},
  options: { resoph?: boolean; ownFolder?: boolean } = {},
) {
  const root = await mkdtemp(path.join(tmpdir(), 'b-notes-library-'));
  const notes = path.join(root, 'b-notes');
  const resoph = path.join(root, 'ResophNotes');
  if (options.ownFolder !== false) await mkdir(notes);
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
  const store = createNoteLibrary(
    own,
    // As the app has it: a machine without Resoph has no Resoph folder at all.
    options.resoph === false ? null : createResophFolder(files, slashed(resoph), log),
    files,
    slashed(notes),
    log,
    renamed,
    NAMING,
  );
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

  it("are listed on a machine's first start, before b-notes has a folder of its own", async () => {
    // It comes into being with the first text b-notes writes, so on every
    // machine's first start it is rightly not there yet.
    const { store, notes } = await library({ [RANKED]: 'Tekst.' }, { ownFolder: false });

    assert.deepEqual((await store.list()).map((note) => note.title), ['*GRAD Kilim']);

    await store.save(resophIdOf(RANKED), '                *GRAD Kilim\n\nTekst. Dopisano.');
    assert.equal((await readdir(notes)).some((name) => name.endsWith('.txt')), true);
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

/**
 * The line a stub of this kind opens with, whatever the wording is now. Taken
 * from what b-notes writes, so these tests check the kind and never the words.
 */
const firstLineOfStub = (kind: StubKind): string | undefined =>
  stubText({ kind, when: new Date(), machine: '', path: '', code: '' }).split('\r\n')[0];

/** What a Resoph file holds now. */
const resophFile = (resoph: string, name: string): Promise<string> => readFile(path.join(resoph, `${name}.txt`), 'utf8');

/** Rewrites a Resoph file the way Resoph would, dated `when`. */
async function resophWrites(resoph: string, name: string, text: string, when = new Date()): Promise<void> {
  await writeFile(path.join(resoph, `${name}.txt`), text, 'utf8');
  await utimes(path.join(resoph, `${name}.txt`), when, when);
}

describe('the first time he types into a Resoph text', () => {
  it('takes it over into a copy of b-notes own, named from the Resoph file', async () => {
    const { store, notes } = await library({ [RANKED]: 'Prvi red.' });

    const id = await store.save(resophIdOf(RANKED), '                *GRAD Kilim\nPrvi red, bolji.');

    assert.equal(id, copyNameFor(RANKED));
    assert.equal(
      await readFile(path.join(notes, `${copyNameFor(RANKED)}.txt`), 'utf8'),
      '                *GRAD Kilim\nPrvi red, bolji.',
    );
  });

  it('leaves a stub in the Resoph file, under the same name, saying where the text went', async () => {
    const { store, resoph } = await library({ [RANKED]: 'Prvi red.' });

    await store.save(resophIdOf(RANKED), '                *GRAD Kilim\nPrvi red, bolji.');

    const stub = await resophFile(resoph, RANKED);
    assert.equal(isStub(stub), true);
    assert.equal(stub.split('\r\n')[0], firstLineOfStub('moved'));
    assert.ok(stub.includes(`${copyNameFor(RANKED)}.txt`), 'the stub does not say which file');
    assert.ok(stub.includes('2026-09-27 10:00, Test'), 'the stub does not say when and where');
    assert.ok(stub.includes('\r\n'), 'the stub is not written as Resoph writes its files');
  });

  it('takes over a name with a space after it too, and saves the copy again', async () => {
    // The shape 0.7.0 refused on his machine, every autosave, until he closed
    // it: ranked, escaped, and a space before the extension.
    const trailing = `${' '.repeat(30)}%2AKILIM `;
    const { store, resoph } = await library({ [trailing]: 'Prvi red.' });

    const id = await store.save(resophIdOf(trailing), `${' '.repeat(30)}*KILIM \nPrvi red, bolji.`);

    assert.equal(id, copyNameFor(trailing));
    assert.equal(await store.save(id, `${' '.repeat(30)}*KILIM \nPrvi red, jos bolji.`), id);
    assert.equal(await store.read(id), `${' '.repeat(30)}*KILIM \nPrvi red, jos bolji.`);
    assert.equal(isStub(await resophFile(resoph, trailing)), true);
  });

  it("keeps what Resoph had as a version, labelled as coming from Resoph", async () => {
    const { store } = await library({ Pismo: 'Prvi red.' });

    const id = await store.save(resophIdOf('Pismo'), 'Pismo\nNesto sasvim drugo.');

    const versions = await store.listVersions(id ?? '');
    const fromResoph = versions.find((version) => version.id.endsWith(` ${FROM_RESOPH}`));
    assert.equal(fromResoph?.text, 'Pismo\n\nPrvi red.');
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

  it('gives the same copy the same name on every machine', async () => {
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

  it('builds on the words he saw, and leaves a Resoph file that changed meanwhile as it is', async () => {
    // The Dell asleep with the text open; the same text changed in Resoph on
    // the Asus; the Dell woken, and a sentence added before anything looked.
    const { store, resoph } = await library({ Pismo: 'Prvo.' });
    await store.list();
    await resophWrites(resoph, 'Pismo', 'Prvo, dopisano na drugom racunaru.', new Date(Date.now() + 60_000));

    await store.save(resophIdOf('Pismo'), 'Pismo\n\nPrvo. Dopisano ovde.');

    assert.equal(await resophFile(resoph, 'Pismo'), 'Prvo, dopisano na drugom racunaru.');
    const texts = (await store.list()).map((note) => note.text).sort();
    assert.deepEqual(texts, ['Pismo\n\nPrvo, dopisano na drugom racunaru.', 'Pismo\n\nPrvo. Dopisano ovde.']);
  });
});

describe('when the copy cannot be trusted', () => {
  it('leaves his words in Resoph when the copy does not read back whole', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'b-notes-library-'));
    const notes = path.join(root, 'b-notes');
    const resoph = path.join(root, 'ResophNotes');
    await mkdir(notes);
    await mkdir(resoph);
    await writeFile(path.join(resoph, 'Pismo.txt'), 'Prvo.', 'utf8');
    const disk = createFileSystem(path.join(tmpdir(), 'b-notes-staging'));
    // A disk that loses the end of the copy, and only of the copy.
    const lossy = {
      ...disk,
      write: (at: string, text: string) =>
        disk.write(at, at.endsWith(`${copyNameFor('Pismo')}.txt`) && !at.includes(VERSIONS_FOLDER) ? text.slice(0, 5) : text),
    };
    const log = silentLog();
    const own = createNoteStore(lossy, slashed(notes), log, () => undefined, NAMING);
    const store = createNoteLibrary(own, createResophFolder(lossy, slashed(resoph), log), lossy, slashed(notes), log);

    await assert.rejects(store.save(resophIdOf('Pismo'), 'Pismo\n\nPrvo. Dopisano.'));

    assert.equal(await resophFile(resoph, 'Pismo'), 'Prvo.');
  });
});

describe('a stub in Resoph', () => {
  /** A Resoph text taken over, and what the stub says. */
  async function takenOver() {
    const found = await library({ Pismo: 'Prvo.' });
    await found.store.save(resophIdOf('Pismo'), 'Pismo\n\nPrvo. Dopisano.');
    return { ...found, stub: await resophFile(found.resoph, 'Pismo') };
  }

  it('stays hidden with a stray keystroke or two in it', async () => {
    const { store, resoph, stub } = await takenOver();

    await resophWrites(resoph, 'Pismo', `${stub}kk`);

    assert.deepEqual((await store.list()).map((note) => note.id), [copyNameFor('Pismo')]);
  });

  it('is a text of his again once he writes in it, beside the copy', async () => {
    const { store, resoph, stub } = await takenOver();

    await resophWrites(resoph, 'Pismo', `${stub}\r\nIpak sam ovde dopisao celu jednu recenicu.`);

    const ids = (await store.list()).map((note) => note.id).sort();
    assert.deepEqual(ids, [copyNameFor('Pismo'), resophIdOf('Pismo')].sort());
  });

  it("is taken over into a copy of its own when he types in that in b-notes, and the first copy is left alone", async () => {
    const { store, resoph } = await takenOver();
    await resophWrites(resoph, 'Pismo', 'Prvo, pa napisano u Resophu posle.');
    await store.list();

    const second = await store.save(resophIdOf('Pismo'), 'Pismo\n\nPrvo, pa napisano u Resophu posle. I jos.');

    assert.equal(second, `${copyNameFor('Pismo')} 2`);
    assert.equal(await store.read(copyNameFor('Pismo')), 'Pismo\n\nPrvo. Dopisano.');
  });
});

describe('what b-notes does to Resoph folder', () => {
  it('leaves a stub in each text it takes over, and renames, adds and removes nothing', async () => {
    const { store, resoph } = await library({ Pismo: 'Tekst.', [RANKED]: 'Rangiran.', Zima: 'Snijeg.', Leto: 'Sunce.' });
    const names = (await readdir(resoph)).sort();

    await store.save(resophIdOf('Pismo'), 'Pismo\nIzmijenjeno.');
    await store.keepCopy(resophIdOf(RANKED), 'Nesto.');
    await store.moveToDeleted(resophIdOf('Zima'));
    await store.restore(copyNameFor('Zima'));
    await store.moveToDeleted(copyNameFor('Zima'));
    await store.destroy(copyNameFor('Zima'));
    await store.list();

    assert.deepEqual((await readdir(resoph)).sort(), names);
    for (const name of ['Pismo', RANKED, 'Zima']) assert.equal(isStub(await resophFile(resoph, name)), true, name);
    assert.equal(await resophFile(resoph, 'Leto'), 'Sunce.');
  });
});

describe('moving a text to Resoph', () => {
  /** Refused for this reason, and nothing changed. */
  const refusedFor = (reason: string) => (failure: unknown) =>
    failure instanceof ResophMoveRefused && failure.reason === reason;

  it('writes it into a file named from its first line, as Resoph names files, spaces and all', async () => {
    const { store, resoph } = await library();
    const id = (await store.save(null, '   *GRAD: Kilim?  \n\nPrvi red.\nDrugi.')) ?? '';

    const moved = await store.moveToResoph(id);

    assert.equal(moved, resophIdOf('   %2AGRAD%3A Kilim%3F  '));
    assert.equal(await resophFile(resoph, '   %2AGRAD%3A Kilim%3F  '), 'Prvi red.\r\nDrugi.');
  });

  it('takes it out of b-notes and shows it as a Resoph text, reading as it did', async () => {
    const { store } = await library();
    const id = (await store.save(null, 'Pismo\n\nPrvi red.')) ?? '';

    await store.moveToResoph(id);

    const notes = await store.list();
    assert.deepEqual(notes.map((note) => note.id), [resophIdOf('Pismo')]);
    assert.equal(notes[0]?.text, 'Pismo\n\nPrvi red.');
  });

  it('keeps its versions in b-notes, for recovery', async () => {
    const { store, notes } = await library();
    const id = (await store.save(null, 'Pismo\n\nPrvo.')) ?? '';
    await store.keepCopy(id, 'Pismo\n\nStarije.');

    await store.moveToResoph(id);

    assert.equal((await readdir(path.join(notes, VERSIONS_FOLDER, id))).length, 1);
  });

  it('says the text is now held under its Resoph id', async () => {
    const { store, renames } = await library();
    const id = (await store.save(null, 'Pismo\n\nPrvo.')) ?? '';

    await store.moveToResoph(id);

    assert.deepEqual(renames.at(-1), [id, resophIdOf('Pismo')]);
  });

  it('goes back over its own stub when it came from Resoph', async () => {
    const { store, resoph } = await library({ Pismo: 'Prvo.' });
    const copy = (await store.save(resophIdOf('Pismo'), 'Pismo\n\nPrvo. Dopisano.')) ?? '';

    await store.moveToResoph(copy);

    assert.equal(await resophFile(resoph, 'Pismo'), 'Prvo. Dopisano.');
    assert.deepEqual((await readdir(resoph)).sort(), ['Pismo.txt']);
  });

  it('keeps a line he typed into the stub before writing over it, though the stub hid it', async () => {
    const { store, resoph, notes } = await library({ Pismo: 'Prvo.' });
    const copy = (await store.save(resophIdOf('Pismo'), 'Pismo\n\nPrvo. Dopisano.')) ?? '';
    const stub = await resophFile(resoph, 'Pismo');
    await resophWrites(resoph, 'Pismo', `Upisao sam ovo u Resophu\r\n${stub}`);
    // Still a stub by the rule — a first line may be a title Resoph wrote in —
    // so still hidden, and only a kept version stands between it and the move.
    assert.equal((await store.list()).length, 1, 'the stub with his first line in it is not hidden');

    await store.moveToResoph(copy);

    const kept = await readdir(path.join(notes, VERSIONS_FOLDER, copy));
    const texts = await Promise.all(kept.map((name) => readFile(path.join(notes, VERSIONS_FOLDER, copy, name), 'utf8')));
    assert.ok(texts.some((text) => text.includes('Upisao sam ovo u Resophu')), 'his line was not kept');
  });

  it('keeps nothing more of a stub that holds only what b-notes wrote', async () => {
    const { store, notes } = await library({ Pismo: 'Prvo.' });
    const copy = (await store.save(resophIdOf('Pismo'), 'Pismo\n\nPrvo. Dopisano.')) ?? '';
    const before = await readdir(path.join(notes, VERSIONS_FOLDER, copy));

    await store.moveToResoph(copy);

    assert.deepEqual(await readdir(path.join(notes, VERSIONS_FOLDER, copy)), before);
  });

  it('never writes over a text of his in Resoph that has the same title', async () => {
    const { store, resoph } = await library({ Pismo: 'Njegov tekst u Resophu.' });
    const id = (await store.save(null, 'Pismo\n\nDrugi.')) ?? '';

    await assert.rejects(store.moveToResoph(id), refusedFor('title-taken'));

    assert.equal(await resophFile(resoph, 'Pismo'), 'Njegov tekst u Resophu.');
    assert.equal(await store.read(id), 'Pismo\n\nDrugi.');
  });

  it('refuses a title longer than Resoph names its files', async () => {
    const { store } = await library();
    const id = (await store.save(null, `${'Dugacak naslov '.repeat(8)}\n\nTekst.`)) ?? '';

    await assert.rejects(store.moveToResoph(id), refusedFor('title-too-long'));
  });

  it('keeps his text in b-notes when what was written into Resoph does not read back whole', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'b-notes-library-'));
    const notes = path.join(root, 'b-notes');
    const resoph = path.join(root, 'ResophNotes');
    await mkdir(notes);
    await mkdir(resoph);
    const disk = createFileSystem(path.join(tmpdir(), 'b-notes-staging'));
    // A disk that loses the end of whatever is written into Resoph's folder.
    const lossy = {
      ...disk,
      write: (at: string, text: string) => disk.write(at, at.includes('ResophNotes') ? text.slice(0, 3) : text),
    };
    const log = silentLog();
    const own = createNoteStore(lossy, slashed(notes), log, () => undefined, NAMING);
    const store = createNoteLibrary(own, createResophFolder(lossy, slashed(resoph), log), lossy, slashed(notes), log);
    const id = (await store.save(null, 'Pismo\n\nPrvi red, dugacak.')) ?? '';

    await assert.rejects(store.moveToResoph(id));

    assert.equal(await store.read(id), 'Pismo\n\nPrvi red, dugacak.');
  });

  it('refuses on a machine without Resoph', async () => {
    const { store } = await library({}, { resoph: false });
    const id = (await store.save(null, 'Pismo\n\nTekst.')) ?? '';

    await assert.rejects(store.moveToResoph(id), refusedFor('no-resoph'));
  });
});

describe('putting away a Resoph text', () => {
  it("puts away b-notes' copy of it, and leaves a stub saying it was deleted", async () => {
    const { store, notes, resoph } = await library({ Zima: 'Snijeg.' });

    await store.moveToDeleted(resophIdOf('Zima'));

    assert.deepEqual(await store.list(), []);
    assert.deepEqual(
      (await readdir(path.join(notes, DELETED_FOLDER))).sort(),
      [`${copyNameFor('Zima')}.txt`, VERSIONS_FOLDER].sort(),
    );
    assert.deepEqual((await store.listDeleted()).map((note) => note.text), ['Zima\n\nSnijeg.']);
    const stub = await resophFile(resoph, 'Zima');
    assert.equal(isStub(stub), true);
    assert.equal(stub.split('\r\n')[0], firstLineOfStub('deleted'));
  });

  it('comes back as the copy, once only', async () => {
    const { store } = await library({ Zima: 'Snijeg.' });
    await store.moveToDeleted(resophIdOf('Zima'));

    await store.restore(copyNameFor('Zima'));

    assert.deepEqual((await store.list()).map((note) => note.id), [copyNameFor('Zima')]);
  });

  it('stays gone once destroyed: the stub is still in Resoph, and is not listed', async () => {
    const { store } = await library({ Zima: 'Snijeg.' });
    await store.moveToDeleted(resophIdOf('Zima'));

    await store.destroy(copyNameFor('Zima'));

    assert.deepEqual(await store.list(), []);
  });
});

describe('keeping a copy of a Resoph text', () => {
  it('takes the text over first, then keeps the copy', async () => {
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
