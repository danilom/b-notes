import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { setTimeout as after } from 'node:timers/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

import { createFileSystem } from '../src/hosts/electron/disk-file-system.ts';
import type { FileSystem } from '../src/platform/file-system.ts';
import { createNoteStore } from '../src/notes/note-store.ts';
import {
  DELETED_FOLDER,
  EXTENSION,
  VERSIONS_FOLDER,
  baseOf,
  fileNameBase,
  isConflictedCopy,
  putAwayVersionsFolderFor,
  versionName,
} from '../src/notes/note-naming.ts';
import { survivedTooLittle } from '../src/notes/note.ts';
import { toSearchable } from '../src/language/diacritics.ts';
import { MAX_TITLE, titleFrom } from '../src/notes/note-title.ts';

/**
 * The shared note store on top of the real filesystem — the combination the
 * installed app actually runs.
 */
async function emptyStore() {
  const dir = await mkdtemp(path.join(tmpdir(), 'b-notes-'));
  return { dir, store: createNoteStore(createFileSystem(), dir.replaceAll("\\", "/")) };
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
  it('takes the first line when it says enough on its own', () => {
    assert.equal(titleFrom('O zimi\n\nNešto dalje.'), 'O zimi');
  });

  it('joins the stacked, indented lines he writes titles on', () => {
    assert.equal(titleFrom('x1\n  y\n    whatever\n\nTekst.'), 'x1 y whatever');
  });

  it('reads past a blank line when the opening tells him nothing', () => {
    assert.equal(titleFrom('S\n\nPišem ti podstaknut'), 'S Pišem ti podstaknut');
  });

  it('stops at a blank line once there is enough to recognise', () => {
    assert.equal(titleFrom('Devojka\n\nDanas sam vidio.'), 'Devojka');
  });

  it('keeps reading past several blank lines while the title is useless', () => {
    assert.equal(titleFrom('S\n\n\n\nPišem ti'), 'S Pišem ti');
  });

  it('skips blank lines above his text', () => {
    assert.equal(titleFrom('\n\n\nO zimi\nDalje.'), 'O zimi');
  });

  it('stops at the end of the line he wrote, not only at a blank one', () => {
    // One press of Enter, which is what he will actually do while writing here.
    assert.equal(titleFrom('devojka\ntekst počinje ovde...'), 'devojka');
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

    assert.equal(await store.save(null, 'O zimi\n\nTekst.'), 'O zimi');
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

    assert.equal(second, 'O ljetu');
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

    assert.equal(await store.save(null, 'O zimi\n\nJedan.'), 'O zimi');
    assert.equal(await store.save(null, 'O zimi\n\nDva.'), 'O zimi (1)');
  });

  it('does not let the suffix accumulate when a duplicate is edited', async () => {
    const { store } = await emptyStore();
    await store.save(null, 'O zimi\n\nJedan.');

    let id = await store.save(null, 'O zimi\n\nDva.');
    for (let round = 0; round < 5; round += 1) id = await store.save(id, `O zimi\n\nDva. ${round}`);

    assert.equal(id, 'O zimi (1)');
  });

  it('numbers a third duplicate without reusing the second name', async () => {
    const { store } = await emptyStore();
    await store.save(null, 'Ponovljeni\n\nJedan.');
    await store.save(null, 'Ponovljeni\n\nDva.');

    assert.equal(await store.save(null, 'Ponovljeni\n\nTri.'), 'Ponovljeni (2)');
  });

  it('emptying an existing note keeps the file, since that is how he deletes', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nTekst.');

    await store.save(id, '');

    assert.deepEqual(
      (await readdir(dir)).filter((name) => name.endsWith(EXTENSION)),
      ['O zimi.txt'],
    );
  });

  it('keeps what he emptied, since emptying is the one edit that leaves nothing', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nSve što je napisao.');

    await store.save(id, '');

    const kept = await readdir(path.join(dir, VERSIONS_FOLDER, 'O zimi'));
    assert.equal(kept.length, 1);
    assert.equal(
      await readFile(path.join(dir, VERSIONS_FOLDER, 'O zimi', kept[0] ?? ''), 'utf8'),
      'O zimi\n\nSve što je napisao.',
    );
  });

  it('does not keep a version of a note that was already empty', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nTekst.');
    await store.save(id, '');
    await store.save(id, '');

    assert.equal((await readdir(path.join(dir, VERSIONS_FOLDER, 'O zimi'))).length, 1);
  });

  it('leaves his text alone when the version cannot be kept', async () => {
    // The save is about to destroy the only copy. If what it would destroy
    // cannot be kept, it does not happen — he sees "not saved" and the text
    // is still on disk for the next attempt.
    const dir = await mkdtemp(path.join(tmpdir(), 'b-notes-'));
    const real = createFileSystem();
    const refusesVersions: FileSystem = {
      ...real,
      write: async (at, text) =>
        at.includes(VERSIONS_FOLDER) ? Promise.reject(new Error('disk full')) : real.write(at, text),
    };
    const store = createNoteStore(refusesVersions, dir.replaceAll('\\', '/'));
    const id = await store.save(null, 'O zimi\n\nTekst koji mora preživjeti.');

    await assert.rejects(() => store.save(id, ''));

    assert.equal(await store.read(id ?? ''), 'O zimi\n\nTekst koji mora preživjeti.');
  });

  it('sends a note\'s earlier versions after it when it is put away', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nTekst.');
    await store.save(id, '');

    await store.moveToDeleted(id ?? '');

    const moved = await readdir(path.join(dir, DELETED_FOLDER, VERSIONS_FOLDER, 'O zimi'));
    assert.equal(moved.length, 1);
  });

  it('never lets a new note inherit a dead one\'s versions', async () => {
    const { dir, store } = await emptyStore();
    const first = await store.save(null, 'O zimi\n\nPrvi tekst.');
    await store.save(first, '');
    await store.moveToDeleted(first ?? '');

    // He writes something new that happens to start with the same words.
    const second = await store.save(null, 'O zimi\n\nSasvim drugi tekst.');
    await store.save(second, '');

    const theirs = await readdir(path.join(dir, VERSIONS_FOLDER, 'O zimi'));
    assert.equal(theirs.length, 1);
    assert.equal(
      await readFile(path.join(dir, VERSIONS_FOLDER, 'O zimi', theirs[0] ?? ''), 'utf8'),
      'O zimi\n\nSasvim drugi tekst.',
    );
  });

  it('emptying a note keeps its name, which is all that is left of it', async () => {
    const { store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nTekst.');

    assert.equal(await store.save(id, ''), 'O zimi');
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

describe('survivedTooLittle', () => {
  it('treats trimming a sentence as an edit', () => {
    assert.equal(survivedTooLittle('foo bar a lot whatever', 'whatever'), false);
  });

  it('treats an essay replaced by a keystroke as a replacement', () => {
    assert.equal(survivedTooLittle('x'.repeat(20000), 'y'), true);
  });

  it('scales to a short note rather than using a byte count', () => {
    assert.equal(survivedTooLittle('dvadeset karaktera ovdje', 'y'), true);
  });

  it('says nothing about a note that had no text to begin with', () => {
    assert.equal(survivedTooLittle('', 'nešto novo'), false);
  });
});

describe('moving a note out of the way', () => {
  it('puts it in the deleted folder', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nTekst.');

    await store.moveToDeleted(id ?? '');

    assert.deepEqual(await readdir(path.join(dir, DELETED_FOLDER)), ['O zimi.txt']);
    assert.equal((await readdir(dir)).includes('O zimi.txt'), false);
  });

  it('keeps the name it had, which after an emptying is all that is left', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nTekst.');
    await store.save(id, '');

    await store.moveToDeleted(id ?? '');

    assert.deepEqual(await readdir(path.join(dir, DELETED_FOLDER)), ['O zimi.txt', VERSIONS_FOLDER]);
  });

  it('keeps both when a deleted note of that name is already there', async () => {
    const { dir, store } = await emptyStore();
    const first = await store.save(null, 'Ponovljeni\n\nJedan.');
    await store.moveToDeleted(first ?? '');
    const second = await store.save(null, 'Ponovljeni\n\nDva.');

    await store.moveToDeleted(second ?? '');

    assert.deepEqual((await readdir(path.join(dir, DELETED_FOLDER))).sort(), [
      'Ponovljeni (1).txt',
      'Ponovljeni.txt',
    ]);
  });

  it('takes the version folder with it, so nothing empty is left wearing its name', async () => {
    // A folder named after one of his texts with nothing inside it reads as a
    // text that went missing, which is the one impression this app cannot give.
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nTekst.');
    await store.save(id, '');

    await store.moveToDeleted(id ?? '');

    // Nothing of it stays behind in his writing folder at all now: what was
    // kept of it went with it, under Obrisano.
    await assert.rejects(() => readdir(path.join(dir, VERSIONS_FOLDER)));
  });

  it('makes no version folder for a note that never had one', async () => {
    // Asking what is in a folder creates it, so the question has to tidy up
    // after itself as well as the answer.
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nTekst.');

    await store.moveToDeleted(id ?? '');

    assert.equal((await readdir(dir)).includes(VERSIONS_FOLDER), false);
  });

  it('refuses an id that points outside the notes folder', async () => {
    const { store } = await emptyStore();

    await assert.rejects(() => store.moveToDeleted('../../secrets.txt'));
  });
});

describe('converting to plain text', () => {
  it('renames a .md note to .txt, so Notepad can open it', async () => {
    const { dir, store } = await emptyStore();
    await writeFile(path.join(dir, 'Esej o zimi.md'), 'Esej o zimi\n\nTekst.', 'utf8');

    assert.deepEqual(await store.convertToPlainText(), { converted: 1, refused: [] });
    assert.deepEqual(await readdir(dir), ['Esej o zimi.txt']);
  });

  it('keeps the text intact', async () => {
    const { dir, store } = await emptyStore();
    await writeFile(path.join(dir, 'Esej o zimi.md'), 'Esej o zimi\n\nTekst.', 'utf8');

    await store.convertToPlainText();

    assert.equal(await store.read('Esej o zimi'), 'Esej o zimi\n\nTekst.');
  });

  it('does not overwrite a .txt that already has that name', async () => {
    const { dir, store } = await emptyStore();
    await writeFile(path.join(dir, 'Esej o zimi.txt'), 'Esej o zimi\n\nIz txt.', 'utf8');
    await writeFile(path.join(dir, 'Esej o zimi.md'), 'Esej o zimi\n\nIz md.', 'utf8');

    await store.convertToPlainText();

    assert.deepEqual((await readdir(dir)).sort(), ['Esej o zimi (1).txt', 'Esej o zimi.txt']);
  });

  it('keeps both texts when it has to rename around a clash', async () => {
    const { dir, store } = await emptyStore();
    await writeFile(path.join(dir, 'Esej o zimi.txt'), 'Esej o zimi\n\nIz txt.', 'utf8');
    await writeFile(path.join(dir, 'Esej o zimi.md'), 'Esej o zimi\n\nIz md.', 'utf8');

    await store.convertToPlainText();

    const texts = (await store.list()).map((note) => note.text).sort();
    assert.deepEqual(texts, ['Esej o zimi\n\nIz md.', 'Esej o zimi\n\nIz txt.']);
  });

  it('leaves notes that are already plain text alone', async () => {
    const { store } = await emptyStore();
    await store.save(null, 'Esej o zimi\n\nTekst.');

    assert.deepEqual(await store.convertToPlainText(), { converted: 0, refused: [] });
  });

  it('is safe to run again', async () => {
    const { dir, store } = await emptyStore();
    await writeFile(path.join(dir, 'Esej o zimi.md'), 'Esej o zimi\n\nTekst.', 'utf8');

    await store.convertToPlainText();
    await store.convertToPlainText();

    assert.deepEqual(await readdir(dir), ['Esej o zimi.txt']);
  });

  it('does not list a note still in another format', async () => {
    const { dir, store } = await emptyStore();
    await writeFile(path.join(dir, 'Esej o zimi.md'), 'Esej o zimi\n\nTekst.', 'utf8');

    assert.deepEqual(await store.list(), []);
  });
});

describe('keeping a copy before writing over his work', () => {
  const ESSAY = `O zimi\n\n${'rec '.repeat(800)}`;
  const versionsOf = async (dir: string, id: string): Promise<string[]> =>
    readdir(path.join(dir, VERSIONS_FOLDER, id)).catch(() => []);

  it('keeps nothing while he is writing', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nPocetak.');

    await store.save(id, ESSAY);

    assert.deepEqual(await versionsOf(dir, id ?? ''), []);
  });

  it('keeps nothing when he trims a sentence', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, ESSAY);

    await store.save(id, ESSAY.replace('rec rec rec ', ''));

    assert.deepEqual(await versionsOf(dir, id ?? ''), []);
  });

  it('keeps the essay when a keystroke replaces it', async () => {
    // Select all, then type. The failure this exists for.
    const { dir, store } = await emptyStore();
    const id = await store.save(null, ESSAY);

    await store.save(id, 'y');

    const kept = await versionsOf(dir, id ?? '');
    assert.equal(kept.length, 1);
    assert.equal(
      await readFile(path.join(dir, VERSIONS_FOLDER, id ?? '', kept[0] ?? ''), 'utf8'),
      ESSAY,
    );
  });

  it('keeps one copy through a long cutting session, not six', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, ESSAY);

    let now = ESSAY;
    for (const keep of [600, 400, 200, 50]) {
      now = `O zimi\n\n${'rec '.repeat(keep)}`;
      await store.save(id, now);
    }

    const kept = await versionsOf(dir, id ?? '');
    assert.equal(kept.length, 1);
    assert.equal(
      await readFile(path.join(dir, VERSIONS_FOLDER, id ?? '', kept[0] ?? ''), 'utf8'),
      ESSAY,
    );
  });

  it('measures against the newest copy when two were kept in one second', async () => {
    /*
      Two copies taken inside a second are named "...00" and "...00 (1)", and
      with the extension on the end the space in " (1)" sorts before the dot in
      ".txt". Read as filenames, the newer of the two comes first and the older
      one is taken for the newest — so a cut would be measured against a copy
      from long before, and keep one it did not need to.

      Written by hand rather than by racing the clock, so this cannot pass by
      landing either side of a second.
    */
    const { dir, store } = await emptyStore();
    const id = (await store.save(null, ESSAY)) ?? '';
    const folder = path.join(dir, VERSIONS_FOLDER, id);
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, '2026-01-01 10-00-00.txt'), 'O zimi\n\n', 'utf8');
    await writeFile(path.join(folder, '2026-01-01 10-00-00 (1).txt'), ESSAY, 'utf8');

    // Nothing new has been written since the newest copy, so cutting keeps none.
    await store.save(id, `O zimi\n\n${'rec '.repeat(100)}`);

    assert.deepEqual((await versionsOf(dir, id)).length, 2);
  });

  it('keeps another once he has written something new to lose', async () => {
    /*
      The case a five minute window would have missed: he cuts, writes a fresh
      paragraph, then loses that. The copy from the first cut cannot hold it.
    */
    const { dir, store } = await emptyStore();
    const id = await store.save(null, ESSAY);
    await store.save(id, `O zimi\n\n${'rec '.repeat(200)}`);

    const withNewWriting = `O zimi\n\n${'rec '.repeat(200)}${'novo '.repeat(80)}`;
    await store.save(id, withNewWriting);
    await store.save(id, 'O zimi\n\n');

    const kept = await versionsOf(dir, id ?? '');
    assert.equal(kept.length, 2);

    const holding = await Promise.all(
      kept.map((name) => readFile(path.join(dir, VERSIONS_FOLDER, id ?? '', name), 'utf8')),
    );
    assert.equal(
      holding.filter((copy) => copy.includes('novo')).length,
      1,
      'the new writing survives in one of the copies kept',
    );
  });
});

describe('when a deleted text says it went', () => {
  const LONG_AGO = new Date(2019, 0, 1);

  it('says when he put it away, not when he last wrote in it', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'Stari\n\nPisan davno.');
    await utimes(path.join(dir, 'Stari.txt'), LONG_AGO, LONG_AGO);
    const putAwayAt = Date.now();

    await store.moveToDeleted(id ?? '');

    const [put] = await store.listDeleted();
    assert.ok(
      (put?.updatedAt ?? 0) >= putAwayAt - 1000,
      `said ${new Date(put?.updatedAt ?? 0).toISOString()}, which is not when it was put away`,
    );
  });

  it('lists what he threw away last first, however old the writing is', async () => {
    // What he just deleted is what he is most likely hunting for. Sorted by the
    // writing's own age, a text from 2019 deleted this morning would sit at the
    // bottom of the one screen that exists to find it.
    const { dir, store } = await emptyStore();
    const recent = await store.save(null, 'Noviji\n\nSkoro napisan.');
    await store.moveToDeleted(recent ?? '');

    // Far enough apart that the two have different times. Without this they can
    // both land in the same millisecond, and then the order is whichever way the
    // sort happens to fall — a test that passes by luck.
    await after(20);

    const old = await store.save(null, 'Stari\n\nPisan davno.');
    await utimes(path.join(dir, 'Stari.txt'), LONG_AGO, LONG_AGO);
    await store.moveToDeleted(old ?? '');

    assert.deepEqual((await store.listDeleted()).map((note) => note.title), ['Stari', 'Noviji']);
  });

  it('comes back as recently touched, since he has just asked for it', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'Stari\n\nPisan davno.');
    await utimes(path.join(dir, 'Stari.txt'), LONG_AGO, LONG_AGO);
    await store.moveToDeleted(id ?? '');
    const restoredAt = Date.now();

    const back = await store.restore(id ?? '');

    const found = (await store.list()).find((note) => note.id === back);
    assert.ok((found?.updatedAt ?? 0) >= restoredAt - 1000, 'a restored text is not stale');
    assert.equal(found?.text, 'Stari\n\nPisan davno.');
  });
});

describe('a deleted text he had emptied first', () => {
  /** Writes it, empties it so a copy is kept, and puts it away. */
  async function emptiedAndDeleted(store: ReturnType<typeof createNoteStore>): Promise<string> {
    const id = await store.save(null, 'O zimi\n\nSve sto je napisao o zimi.');
    await store.save(id, '');
    await store.moveToDeleted(id ?? '');
    return id ?? '';
  }

  it('is filed with what he wrote in it, rather than as a husk', async () => {
    /*
      A zero-byte file named after an essay says nothing to anyone who opens
      the folder, and breaks the promise plain .txt was chosen for. The last
      kept copy is written into it on the way out, so Obrisano holds his texts
      as he last wrote them.
    */
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nSve sto je napisao o zimi.');
    await store.save(id, '');

    await store.moveToDeleted(id ?? '');

    assert.equal(
      await readFile(path.join(dir, DELETED_FOLDER, 'O zimi.txt'), 'utf8'),
      'O zimi\n\nSve sto je napisao o zimi.',
    );
  });

  it('keeps the copy it was filed from, beside it under Obrisano', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nSve sto je napisao o zimi.');
    await store.save(id, '');

    await store.moveToDeleted(id ?? '');

    const kept = await readdir(path.join(dir, DELETED_FOLDER, VERSIONS_FOLDER, 'O zimi'));
    assert.equal(kept.length, 1);
    assert.equal((await readdir(path.join(dir))).includes(VERSIONS_FOLDER), false);
  });

  it('is listed by what he wrote, not by the husk he left', async () => {
    // Five rows reading "Bez naslova" over forty thousand characters of his
    // writing is what this exists to stop.
    const { store } = await emptyStore();
    await emptiedAndDeleted(store);

    const [put] = await store.listDeleted();
    assert.equal(put?.title, 'O zimi');
    assert.equal(put?.text, 'O zimi\n\nSve sto je napisao o zimi.');
  });

  it('can be searched for by words that are only in the kept copy', async () => {
    const { store } = await emptyStore();
    await emptiedAndDeleted(store);

    const [put] = await store.listDeleted();
    assert.ok(put?.searchable.includes('napisao'), 'the kept copy is what gets searched');
  });

  it('comes back as the writing, not as the empty page', async () => {
    const { store } = await emptyStore();
    const id = await emptiedAndDeleted(store);

    const back = await store.restore(id);

    assert.equal(await store.read(back), 'O zimi\n\nSve sto je napisao o zimi.');
  });

  it('keeps the copy it came from, rather than spending it', async () => {
    const { dir, store } = await emptyStore();
    const id = await emptiedAndDeleted(store);

    const back = await store.restore(id);

    assert.equal((await readdir(path.join(dir, VERSIONS_FOLDER, back))).length, 1);
  });

  it('reads as empty when there is nothing kept of it either', async () => {
    // Put straight into the folder, because nothing in the app can produce one
    // of these any more — an empty text with no copy is removed rather than
    // filed. They arrive only from what was already there when the app found
    // his writing.
    const { dir, store } = await emptyStore();
    await mkdir(path.join(dir, DELETED_FOLDER), { recursive: true });
    await writeFile(path.join(dir, DELETED_FOLDER, 'Bez naslova.txt'), '', 'utf8');

    const [put] = await store.listDeleted();
    assert.equal(put?.text, '');
    assert.equal(put?.versions, 0);
  });

  it('shows the file when there is one, whatever was kept beside it', async () => {
    const { store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nPrvi tekst.');
    await store.save(id, '');
    const again = await store.save(id, 'O zimi\n\nDrugi tekst.');
    await store.moveToDeleted(again ?? '');

    const [put] = await store.listDeleted();
    assert.equal(put?.text, 'O zimi\n\nDrugi tekst.');
  });
});

describe('destroying one for good', () => {
  it('takes the text and every copy of it that was kept', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nSve sto je napisao.');
    await store.save(id, '');
    await store.moveToDeleted(id ?? '');

    await store.destroy(id ?? '');

    assert.deepEqual(await store.listDeleted(), []);
    assert.deepEqual(await readdir(path.join(dir, DELETED_FOLDER)), []);
    await assert.rejects(() => readdir(path.join(dir, DELETED_FOLDER, VERSIONS_FOLDER, id ?? '')));
  });

  it('leaves the others where they are', async () => {
    const { store } = await emptyStore();
    const first = await store.save(null, 'O zimi\n\nPrvi.');
    const second = await store.save(null, 'O jeseni\n\nDrugi.');
    await store.moveToDeleted(first ?? '');
    await store.moveToDeleted(second ?? '');

    await store.destroy(first ?? '');

    assert.deepEqual((await store.listDeleted()).map((note) => note.title), ['O jeseni']);
  });

  it('cannot reach a text that is still in his list', async () => {
    // It only ever acts on what he has already put away, so a text he is
    // working on is out of its reach whatever it is handed.
    const { store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nTekst.');

    await assert.rejects(() => store.destroy(id ?? ''));

    assert.equal(await store.read(id ?? ''), 'O zimi\n\nTekst.');
  });

  it('refuses an id that points outside the deleted folder', async () => {
    const { store } = await emptyStore();

    await assert.rejects(() => store.destroy('../../secrets'));
  });

  it('counts the copies it would destroy, so the app can ask accordingly', async () => {
    const { store } = await emptyStore();
    const kept = await store.save(null, 'O zimi\n\nTekst.');
    await store.save(kept, '');
    const plain = await store.save(null, 'O jeseni\n\nDrugi.');
    await store.moveToDeleted(kept ?? '');
    await store.moveToDeleted(plain ?? '');

    const counted = new Map((await store.listDeleted()).map((note) => [note.id, note.versions]));
    assert.equal(counted.get('O zimi'), 1);
    assert.equal(counted.get('O jeseni'), 0);
  });
});

describe('putting away a text with nothing in it', () => {
  it('removes one that never held anything, rather than filing it', async () => {
    // A row in Obrisani tekstovi that opens onto nothing is a door to an empty
    // room, in the one place he goes to find something he has lost.
    const { dir, store } = await emptyStore();
    await writeFile(path.join(dir, 'Bez naslova.txt'), '', 'utf8');

    await store.moveToDeleted('Bez naslova');

    assert.deepEqual(await store.list(), []);
    assert.deepEqual(await store.listDeleted(), []);
    assert.equal((await readdir(dir)).includes('Bez naslova.txt'), false);
  });

  it('keeps one he emptied, because the copy of it is the text', async () => {
    // Zero bytes on disk, but what used to be in it is still kept — so this is
    // the case where an empty file is the last marker of writing that survives.
    const { store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nSve sto je napisao.');
    await store.save(id, '');

    await store.moveToDeleted(id ?? '');

    assert.deepEqual((await store.listDeleted()).length, 1);
  });

  it('keeps one whose text is only whitespace but which has a version', async () => {
    const { store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nTekst.');
    await store.save(id, '   \n\n  ');

    await store.moveToDeleted(id ?? '');

    assert.deepEqual((await store.listDeleted()).length, 1);
  });
});

describe('bringing a text back', () => {
  it('lists what he has put away, newest first', async () => {
    const { store } = await emptyStore();
    const first = await store.save(null, 'O zimi\n\nPrvi.');
    const second = await store.save(null, 'O jeseni\n\nDrugi.');
    await store.moveToDeleted(first ?? '');
    await store.moveToDeleted(second ?? '');

    assert.deepEqual((await store.listDeleted()).map((note) => note.title), ['O jeseni', 'O zimi']);
  });

  it('shows him what a deleted text said, so he can tell which one it is', async () => {
    const { store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nSve sto je napisao.');
    await store.moveToDeleted(id ?? '');

    const [put] = await store.listDeleted();
    assert.equal(put?.text, 'O zimi\n\nSve sto je napisao.');
  });

  it('keeps them out of the list of his writing', async () => {
    const { store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nTekst.');
    await store.moveToDeleted(id ?? '');

    assert.deepEqual(await store.list(), []);
  });

  it('puts one back where he can find it', async () => {
    const { store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nTekst.');
    await store.moveToDeleted(id ?? '');

    const back = await store.restore(id ?? '');

    assert.equal(back, 'O zimi');
    assert.equal(await store.read(back), 'O zimi\n\nTekst.');
    assert.deepEqual(await store.listDeleted(), []);
  });

  it('does not overwrite a text he has written since, under the same name', async () => {
    const { store } = await emptyStore();
    const first = await store.save(null, 'O zimi\n\nStari tekst.');
    await store.moveToDeleted(first ?? '');
    await store.save(null, 'O zimi\n\nNovi tekst.');

    const back = await store.restore(first ?? '');

    assert.equal(back, 'O zimi (1)');
    assert.equal(await store.read('O zimi'), 'O zimi\n\nNovi tekst.');
    assert.equal(await store.read(back), 'O zimi\n\nStari tekst.');
  });

  it('brings its earlier versions back with it', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nTekst.');
    await store.save(id, '');
    await store.moveToDeleted(id ?? '');

    const back = await store.restore(id ?? '');

    assert.equal((await readdir(path.join(dir, VERSIONS_FOLDER, back))).length, 1);
    await assert.rejects(() => readdir(path.join(dir, DELETED_FOLDER, VERSIONS_FOLDER, back)));
  });

  it('refuses an id that points outside the deleted folder', async () => {
    const { store } = await emptyStore();

    await assert.rejects(() => store.restore('../../secrets'));
  });
});

describe('how long a path the naming can make', () => {
  /*
    Windows refuses a path over 260 characters, and the half of it we do not
    control is his writing folder — it could be Dropbox inside a long Windows
    user name. So what the app adds underneath that folder is budgeted rather
    than left to chance: a version file is the deepest thing it builds, and if
    titles or the folder scheme ever grow, this says so here rather than on his
    machine, where it would show as a text that would not save.
  */
  const WINDOWS_MAX_PATH = 260;
  const ROOM_FOR_HIS_FOLDER = 150;

  it('leaves most of the limit for wherever he keeps his writing', () => {
    const longestId = `${'x'.repeat(MAX_TITLE)} (99)`;
    const deepest = `${putAwayVersionsFolderFor(longestId)}/${versionName(new Date())} (99)${EXTENSION}`;

    assert.ok(
      deepest.length <= WINDOWS_MAX_PATH - ROOM_FOR_HIS_FOLDER,
      `the deepest name the app builds is ${deepest.length} chars, leaving ${WINDOWS_MAX_PATH - deepest.length} for his folder`,
    );
  });
});

describe('what he is shown', () => {
  it('shows him nothing that is filed away under his writing', async () => {
    // The two folders the app keeps beside his texts. Neither is his writing,
    // and an extra row in his list reads to him as a text he does not remember.
    const { dir, store } = await emptyStore();
    await store.save(null, 'O zimi');
    for (const folder of [DELETED_FOLDER, VERSIONS_FOLDER]) {
      await mkdir(path.join(dir, folder, 'O jeseni'), { recursive: true });
      await writeFile(path.join(dir, folder, 'O jeseni', 'staro.txt'), 'Nekad.', 'utf8');
    }

    assert.deepEqual((await store.list()).map((note) => note.title), ['O zimi']);
  });
});

describe('his Windows line endings', () => {
  const CRLF = 'O zimi\r\n\r\nPrvi red.\r\nDrugi red.\r\n';
  const AS_HE_SEES_IT = 'O zimi\n\nPrvi red.\nDrugi red.\n';

  it('hands his text over the way the box he writes in can hold it', async () => {
    const { dir, store } = await emptyStore();
    await writeFile(path.join(dir, 'O zimi.txt'), CRLF, 'utf8');

    assert.equal(await store.read('O zimi'), AS_HE_SEES_IT);
  });

  it('lists it the same way, so nothing above the store sees two formats', async () => {
    const { dir, store } = await emptyStore();
    await writeFile(path.join(dir, 'O zimi.txt'), CRLF, 'utf8');

    const [note] = await store.list();
    assert.equal(note?.text, AS_HE_SEES_IT);
    assert.equal(note?.title, 'O zimi');
  });

  it('settles one of his old files on one format the first time he edits it', async () => {
    /*
      The trap this exists for. A textarea cannot hold a carriage return, so the
      moment he opens one of his files and types, every line differs from what
      is on disk. Compared as they lie, changing one word reads as the text
      having gone — and he has 582 files that would each have said so once. The
      fix is to settle on one format at the door, which is only true if nothing
      puts the old one back on the way out.
    */
    const { dir, store } = await emptyStore();
    await writeFile(path.join(dir, 'O zimi.txt'), CRLF, 'utf8');
    const opened = await store.read('O zimi');

    await store.save('O zimi', opened.replace('Prvi', 'Prvi mali'));

    const onDisk = await readFile(path.join(dir, 'O zimi.txt'), 'utf8');
    assert.ok(!onDisk.includes('\r'), 'a carriage return survived the round trip');
  });

  it('still keeps a copy when he really does empty one of them', async () => {
    const { dir, store } = await emptyStore();
    await writeFile(path.join(dir, 'O zimi.txt'), CRLF, 'utf8');

    await store.save('O zimi', '');

    const kept = await readdir(path.join(dir, VERSIONS_FOLDER, 'O zimi'));
    assert.equal(kept.length, 1);
    assert.equal(
      await readFile(path.join(dir, VERSIONS_FOLDER, 'O zimi', kept[0] ?? ''), 'utf8'),
      AS_HE_SEES_IT,
    );
  });
});

describe('listing', () => {
  it('keeps the searchable form in step with the text it came from', async () => {
    // It is worked out once, when a note is read, and searching trusts it
    // afterwards. If the two ever drift, a search quietly stops finding a text
    // that plainly contains the word — which looks like the text being gone.
    const { store } = await emptyStore();
    await store.save(null, 'Mačka\n\nČičak i šećer, đevrek.');
    await store.save(null, 'Bez kvačica\n\nCicak i secer.');

    for (const note of await store.list()) {
      assert.equal(note.searchable, toSearchable(note.text), note.id);
    }
  });

  it('ignores the deleted folder', async () => {
    const { store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nTekst.');
    await store.moveToDeleted(id ?? '');

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
    await store.save(null, 'Esej o zimi\n\nTekst.');
    await writeFile(path.join(dir, "Esej (Brano's conflicted copy 2026-09-18).txt"), 'x', 'utf8');

    assert.deepEqual(
      (await store.list()).map((note) => note.title),
      ['Esej o zimi'],
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
