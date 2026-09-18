import assert from 'node:assert/strict';
import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  DELETED_FOLDER,
  baseOf,
  createFileNoteStore,
  fileNameBase,
  isConflictedCopy,
  sweepEmptiedNotes,
} from '../src/main/note-store.ts';
import { titleFrom } from '../src/shared/title.ts';

async function emptyStore() {
  const dir = await mkdtemp(path.join(tmpdir(), 'b-notes-'));
  return { dir, store: createFileNoteStore(dir) };
}

describe('isConflictedCopy', () => {
  it('recognises the name Dropbox gives a sync collision', () => {
    assert.equal(isConflictedCopy("Essay (Brano's conflicted copy 2026-09-18).txt"), true);
  });

  it('recognises a same-day second collision', () => {
    assert.equal(isConflictedCopy("Essay (Brano's conflicted copy 2026-09-18 2).txt"), true);
  });

  it('leaves an ordinary name alone', () => {
    assert.equal(isConflictedCopy('Essay about ducks.txt'), false);
  });

  it('does not match prose that merely uses the words', () => {
    assert.equal(isConflictedCopy('On the conflicted copy as a literary device.txt'), false);
  });
});

describe('titleFrom', () => {
  it('takes the first line', () => {
    assert.equal(titleFrom('O zimi\n\nNešto dalje.'), 'O zimi');
  });

  it('skips blank lines above his text', () => {
    assert.equal(titleFrom('\n\n\nO zimi\nDalje.'), 'O zimi');
  });

  it('strips the indentation he leaves in front of it', () => {
    assert.equal(titleFrom('      O zimi\nDalje.'), 'O zimi');
  });

  it('collapses runs of spaces, which he uses freely', () => {
    assert.equal(titleFrom('O    zimi   i   ljetu'), 'O zimi i ljetu');
  });

  it('keeps punctuation, since this is what he reads in the list', () => {
    assert.equal(titleFrom('Je li moguće da?'), 'Je li moguće da?');
  });

  it('breaks a long first line at a word boundary', () => {
    const long = 'Danas nema više kupina za lijepe i vrijedne djevojke iz sela';

    const title = titleFrom(long);

    assert.ok(title.length <= 50);
    assert.ok(long.startsWith(title));
    assert.equal(title, 'Danas nema više kupina za lijepe i vrijedne');
  });

  it('cuts mid-word only when one word would otherwise swallow the title', () => {
    const title = titleFrom(`kratko ${'x'.repeat(60)}`);

    assert.equal(title.length, 50);
  });

  it('is empty for text that is only whitespace', () => {
    assert.equal(titleFrom('   \n\n  '), '');
  });
});

describe('fileNameBase', () => {
  it('keeps an ordinary title intact', () => {
    assert.equal(fileNameBase('O zimskoj svjetlosti'), 'O zimskoj svjetlosti');
  });

  it('replaces characters Windows refuses', () => {
    assert.equal(fileNameBase('Zašto?  Zato: radi/ne radi'), 'Zašto Zato radi ne radi');
  });

  it('falls back when nothing usable is left', () => {
    assert.equal(fileNameBase('///'), 'Bez naslova');
  });

  it('escapes names reserved by Windows', () => {
    assert.equal(fileNameBase('CON'), '_CON');
  });

  it('drops trailing dots, which Windows would silently strip', () => {
    assert.equal(fileNameBase('Prvo poglavlje...'), 'Prvo poglavlje');
  });
});

describe('baseOf', () => {
  it('removes the extension', () => {
    assert.equal(baseOf('Esej.txt'), 'Esej');
  });

  it('removes a disambiguating suffix', () => {
    assert.equal(baseOf('Esej (2).txt'), 'Esej');
  });

  it('leaves an unrelated bracketed word alone', () => {
    assert.equal(baseOf('Esej (drugi dio).txt'), 'Esej (drugi dio)');
  });
});

describe('saving', () => {
  it('creates a note named after his first line', async () => {
    const { store } = await emptyStore();

    assert.equal(await store.save(null, 'O zimi\n\nTekst.'), 'O zimi.txt');
  });

  it('refuses to create anything for an empty new note', async () => {
    const { dir, store } = await emptyStore();

    assert.equal(await store.save(null, '   \n\n'), null);
    assert.deepEqual(await readdir(dir), []);
  });

  it('renames the file when he changes his first line', async () => {
    const { dir, store } = await emptyStore();
    const first = await store.save(null, 'O zimi\n\nTekst.');

    const second = await store.save(first, 'O ljetu\n\nTekst.');

    assert.equal(second, 'O ljetu.txt');
    assert.deepEqual(await readdir(dir), ['O ljetu.txt']);
  });

  it('keeps the text when renaming', async () => {
    const { store } = await emptyStore();
    const first = await store.save(null, 'O zimi\n\nTekst.');

    const second = await store.save(first, 'O ljetu\n\nTekst.');

    assert.equal(await store.read(second ?? ''), 'O ljetu\n\nTekst.');
  });

  it('leaves the filename alone when the first line has not changed', async () => {
    const { store } = await emptyStore();
    const first = await store.save(null, 'O zimi\n\nTekst.');

    assert.equal(await store.save(first, 'O zimi\n\nDrugi tekst.'), first);
  });

  it('gives a second note with the same first line its own file', async () => {
    const { store } = await emptyStore();

    assert.equal(await store.save(null, 'O zimi\n\nJedan.'), 'O zimi.txt');
    assert.equal(await store.save(null, 'O zimi\n\nDva.'), 'O zimi (1).txt');
  });

  it('does not let the suffix accumulate when a duplicate is edited', async () => {
    const { store } = await emptyStore();
    await store.save(null, 'O zimi\n\nJedan.');

    let id = await store.save(null, 'O zimi\n\nDva.');
    for (let round = 0; round < 5; round += 1) id = await store.save(id, `O zimi\n\nDva. ${round}`);

    assert.equal(id, 'O zimi (1).txt');
  });

  it('numbers a third duplicate without reusing the second name', async () => {
    const { store } = await emptyStore();
    await store.save(null, 'Isti\n\nJedan.');
    await store.save(null, 'Isti\n\nDva.');

    assert.equal(await store.save(null, 'Isti\n\nTri.'), 'Isti (2).txt');
  });

  it('emptying an existing note keeps the file, since that is how he deletes', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nTekst.');

    await store.save(id, '');

    assert.equal((await readdir(dir)).length, 1);
  });

  it('emptying a note keeps its name, which is all that is left of it', async () => {
    const { store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nTekst.');

    assert.equal(await store.save(id, ''), 'O zimi.txt');
  });

  it('refuses an id that points outside the notes folder', async () => {
    const { store } = await emptyStore();

    await assert.rejects(() => store.read('../../secrets.txt'));
  });

  it('refuses to write through an id that points outside the notes folder', async () => {
    const { store } = await emptyStore();

    await assert.rejects(() => store.save('../../secrets.txt', 'tekst'));
  });
});

describe('sweeping emptied notes', () => {
  it('moves an emptied note into the deleted folder', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nTekst.');
    await store.save(id, '');

    assert.equal(await sweepEmptiedNotes(dir), 1);
    assert.deepEqual(await readdir(path.join(dir, DELETED_FOLDER)), ['O zimi.txt']);
  });

  it('treats a note holding only whitespace as emptied', async () => {
    const { dir } = await emptyStore();
    await writeFile(path.join(dir, 'Prazan.txt'), '  \n\n  ', 'utf8');

    assert.equal(await sweepEmptiedNotes(dir), 1);
  });

  it('leaves notes that still have text', async () => {
    const { dir, store } = await emptyStore();
    await store.save(null, 'O zimi\n\nTekst.');

    assert.equal(await sweepEmptiedNotes(dir), 0);
    assert.deepEqual(await readdir(dir), ['O zimi.txt']);
  });

  it('creates no deleted folder when there is nothing to move', async () => {
    const { dir, store } = await emptyStore();
    await store.save(null, 'O zimi\n\nTekst.');

    await sweepEmptiedNotes(dir);

    assert.equal((await readdir(dir)).includes(DELETED_FOLDER), false);
  });

  it('keeps both when a deleted note of the same name is already there', async () => {
    const { dir, store } = await emptyStore();
    const first = await store.save(null, 'Isti');
    await store.save(first, '');
    await sweepEmptiedNotes(dir);
    const second = await store.save(null, 'Isti');
    await store.save(second, '');

    await sweepEmptiedNotes(dir);

    assert.deepEqual((await readdir(path.join(dir, DELETED_FOLDER))).sort(), [
      'Isti (1).txt',
      'Isti.txt',
    ]);
  });

  it('does not touch what is already in the deleted folder', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'Isti');
    await store.save(id, '');

    await sweepEmptiedNotes(dir);
    await sweepEmptiedNotes(dir);

    assert.deepEqual(await readdir(path.join(dir, DELETED_FOLDER)), ['Isti.txt']);
  });
});

describe('listing', () => {
  it('ignores the deleted folder', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'Isti\n\nTekst.');
    await store.save(id, '');
    await sweepEmptiedNotes(dir);

    assert.deepEqual(await store.list(), []);
  });

  it('takes titles from the text rather than the filename', async () => {
    const { dir, store } = await emptyStore();
    await writeFile(path.join(dir, 'Zasto Zato.txt'), 'Zašto? Zato!\n\nTekst.', 'utf8');

    const [note] = await store.list();

    assert.equal(note?.title, 'Zašto? Zato!');
  });

  it('hides conflicted copies', async () => {
    const { dir, store } = await emptyStore();
    await store.save(null, 'Esej\n\nTekst.');
    await writeFile(path.join(dir, "Esej (Brano's conflicted copy 2026-09-18).txt"), 'x', 'utf8');

    assert.deepEqual(
      (await store.list()).map((note) => note.title),
      ['Esej'],
    );
  });

  it('ignores files that are not notes', async () => {
    const { dir, store } = await emptyStore();
    await writeFile(path.join(dir, 'desktop.ini'), '', 'utf8');

    assert.deepEqual(await store.list(), []);
  });

  it('reports the size, so title-only jots can be told from essays', async () => {
    const { store } = await emptyStore();
    await store.save(null, 'Samo naslov');

    const [note] = await store.list();

    assert.equal(note?.bytes, Buffer.byteLength('Samo naslov', 'utf8'));
  });
});
