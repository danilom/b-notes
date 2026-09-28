import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { createFileSystem } from '../src/hosts/electron/disk-file-system.ts';
import { IMPORT_RECORD, createArchiveImport, importedText } from '../src/notes/archive-import.ts';
import { createNoteStore } from '../src/notes/note-store.ts';
import { silentLog } from './silent-log.ts';

describe('a raw file in the shape b-notes reads', () => {
  it('gets its title from its name when only the name has it, as Resoph keeps them', () => {
    assert.deepEqual(importedText('      %2AGRAD Kilim', 'Prvi red.\r\nDrugi.'), {
      text: '      *GRAD Kilim\n\nPrvi red.\nDrugi.',
      titled: true,
      empty: false,
    });
  });

  it('is left as it is when it opens with its title already, as Simplenote kept them', () => {
    assert.equal(importedText('Pismo iz Boke', 'Pismo iz Boke\n\nTekst.').titled, false);
    assert.equal(importedText('Pismo iz Boke', 'Pismo iz Boke\n\nTekst.').text, 'Pismo iz Boke\n\nTekst.');
  });

  it('knows its title under other case, marks, punctuation or a copy number', () => {
    assert.equal(importedText('Sta je to', 'Šta je to?\n\nTekst.').titled, false);
    assert.equal(importedText('Pismo (1)', 'Pismo\n\nTekst.').titled, false);
    assert.equal(importedText('Pismo 2', 'PISMO\n\nTekst.').titled, false);
  });

  it('knows a long name cut off in the middle of a word', () => {
    assert.equal(importedText('Kakav coek gospodin bi b', 'Kakav čoek gospodin bi bio da mu nema te mane').titled, false);
  });

  it('does not take a short title for the start of a longer word', () => {
    assert.equal(importedText('Up', 'Upravo sam stigao.').titled, true);
  });

  it('compares a title with no letters in it as it is written', () => {
    assert.equal(importedText('- [ ]', '- [ ] kupiti hleb').titled, false);
    assert.equal(importedText('- [ ]', 'kupiti hleb').titled, true);
  });

  it('keeps an empty one as its title with nothing under it, which is how he jots an idea', () => {
    assert.deepEqual(importedText('Osa i staklo', '  \r\n'), { text: 'Osa i staklo\n\n', titled: false, empty: true });
  });
});

/** A b-notes folder with `Arhiva-raw` holding what it is handed, folder by folder. */
async function folderWith(raw: Record<string, Record<string, string>> | null) {
  const root = await mkdtemp(path.join(tmpdir(), 'b-notes-import-'));
  const notes = path.join(root, 'b-notes');
  await mkdir(notes);
  for (const [archive, texts] of Object.entries(raw ?? {})) {
    await mkdir(path.join(notes, 'Arhiva-raw', archive), { recursive: true });
    for (const [name, text] of Object.entries(texts)) {
      await writeFile(path.join(notes, 'Arhiva-raw', archive, name), text);
    }
  }
  const files = createFileSystem(path.join(root, 'staging'));
  const slashed = notes.replaceAll(path.sep, '/');
  const log = silentLog();
  return { notes, files, log, importer: createArchiveImport(files, slashed, log), store: createNoteStore(files, slashed, log) };
}

/** Every file under a folder, with what it holds and when it was written. */
async function everything(dir: string): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const at = path.join(entry.parentPath, entry.name);
    found[path.relative(dir, at)] = `${(await stat(at)).mtimeMs}|${await readFile(at, 'utf8')}`;
  }
  return found;
}

const quiet = (): void => undefined;

describe('importing a raw folder', () => {
  it('says where Arhiva-raw belongs when there is none', async () => {
    const { importer, notes } = await folderWith(null);

    const survey = await importer.survey();

    assert.equal(survey.present, false);
    assert.equal(survey.where, path.join(notes, 'Arhiva-raw'));
  });

  it('writes each file into Arhiva under its own name, titled, and lists it as an archive', async () => {
    const { importer, notes, store } = await folderWith({
      stari: { '   %2APismo.md': 'Dragi brate.', 'Beleska.txt': 'Beleska\n\nKupiti hleb.' },
    });

    const record = await importer.importOne('stari', quiet);

    assert.equal(record?.written, 2);
    assert.equal(record?.titled, 1);
    assert.equal(await readFile(path.join(notes, 'Arhiva', 'stari', '   %2APismo.txt'), 'utf8'), '   *Pismo\n\nDragi brate.');
    assert.equal(await readFile(path.join(notes, 'Arhiva', 'stari', 'Beleska.txt'), 'utf8'), 'Beleska\n\nKupiti hleb.');
    assert.deepEqual(await store.listArchives(), [{ name: 'stari', texts: 2 }]);
  });

  it('keeps the date each file had, so the archive shows when it was written', async () => {
    const { importer, notes } = await folderWith({ stari: { 'Pismo.md': 'Dragi brate.' } });
    const then = new Date(2019, 2, 12, 9, 30);
    await utimes(path.join(notes, 'Arhiva-raw', 'stari', 'Pismo.md'), then, then);

    await importer.importOne('stari', quiet);

    assert.equal((await stat(path.join(notes, 'Arhiva', 'stari', 'Pismo.txt'))).mtimeMs, then.getTime());
  });

  it('leaves Arhiva-raw exactly as it was', async () => {
    const { importer, notes } = await folderWith({ stari: { 'Pismo.md': 'Dragi brate.', 'Druga.txt': 'Tekst.' } });
    const before = await everything(path.join(notes, 'Arhiva-raw'));

    await importer.importOne('stari', quiet);

    assert.deepEqual(await everything(path.join(notes, 'Arhiva-raw')), before);
  });

  it('never touches a folder again once it is imported, so a text brought back is not imported twice', async () => {
    const { importer, notes } = await folderWith({ stari: { 'Pismo.md': 'Dragi brate.', 'Druga.md': 'Tekst.' } });
    await importer.importOne('stari', quiet);
    // He brings one back: it leaves the archive.
    await rm(path.join(notes, 'Arhiva', 'stari', 'Pismo.txt'));
    const after = await everything(path.join(notes, 'Arhiva'));

    assert.equal(await importer.importOne('stari', quiet), null);

    assert.deepEqual(await everything(path.join(notes, 'Arhiva')), after);
    assert.equal((await importer.survey()).archives[0]?.state.kind, 'done');
  });

  it('carries on an import that stopped part-way, writing over nothing already there', async () => {
    const { importer, notes } = await folderWith({ stari: { 'Pismo.md': 'Dragi brate.', 'Druga.md': 'Tekst.' } });
    await mkdir(path.join(notes, 'Arhiva', 'stari'), { recursive: true });
    await writeFile(path.join(notes, 'Arhiva', 'stari', 'Druga.txt'), 'Vec napisano.');
    assert.deepEqual((await importer.survey()).archives[0]?.state, { kind: 'partial', present: 1 });

    const record = await importer.importOne('stari', quiet);

    assert.equal(record?.written, 1);
    assert.equal(record?.skipped, 1);
    assert.equal(await readFile(path.join(notes, 'Arhiva', 'stari', 'Druga.txt'), 'utf8'), 'Vec napisano.');
  });

  it('leaves out a file that is not UTF-8, and says which, rather than writing "�" into his letters', async () => {
    const { importer, notes } = await folderWith({ stari: { 'Pismo.md': 'Dragi brate.' } });
    await writeFile(path.join(notes, 'Arhiva-raw', 'stari', 'Stara.md'), Buffer.from([0xc8, 0x65, 0x9a, 0xe6, 0x65]));
    const said: string[] = [];

    const record = await importer.importOne('stari', (line) => said.push(line));

    assert.deepEqual(record?.failed, ['Stara.md']);
    assert.equal(record?.written, 1);
    assert.deepEqual((await readdir(path.join(notes, 'Arhiva', 'stari'))).sort(), [IMPORT_RECORD, 'Pismo.txt'].sort());
    assert.ok(said.some((line) => line.includes('Stara.md') && line.includes('not UTF-8')));
  });

  it('keeps two files that land on one name apart, as Windows would not', async () => {
    const { importer, notes } = await folderWith({ stari: { 'Pismo.md': 'Jedan.', 'Pismo.txt': 'Pismo\n\nDva.' } });

    await importer.importOne('stari', quiet);

    const written = (await readdir(path.join(notes, 'Arhiva', 'stari'))).filter((name) => name.endsWith('.txt')).sort();
    assert.deepEqual(written, ['Pismo 2.txt', 'Pismo.txt']);
  });

  it('keeps two names apart that differ only in case, which Windows takes for one file', async () => {
    const { importer, notes } = await folderWith({ stari: { 'pismo.md': 'Malo.', 'Pismo.txt': 'Pismo\n\nVeliko.' } });

    const record = await importer.importOne('stari', quiet);

    assert.equal(record?.written, 2);
    assert.equal(await readFile(path.join(notes, 'Arhiva', 'stari', 'Pismo.txt'), 'utf8'), 'Pismo\n\nVeliko.');
    assert.equal(await readFile(path.join(notes, 'Arhiva', 'stari', 'pismo 2.txt'), 'utf8'), 'pismo\n\nMalo.');
  });

  it('says how far each folder has got', async () => {
    const { importer } = await folderWith({ a: { 'Jedan.md': 'x' }, b: { 'Dva.md': 'y', 'Tri.md': 'z' } });
    await importer.importOne('a', quiet);

    const survey = await importer.survey();

    assert.equal(survey.present, true);
    assert.deepEqual(
      survey.archives.map((archive) => [archive.name, archive.sources, archive.state.kind]),
      [
        ['a', 1, 'done'],
        ['b', 2, 'new'],
      ],
    );
  });
});
