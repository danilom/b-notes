import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { setTimeout as after } from 'node:timers/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

import { createFileSystem } from '../src/hosts/electron/disk-file-system.ts';
import type { FileSystem } from '../src/platform/file-system.ts';
import { createNoteStore } from '../src/notes/note-store.ts';
import { silentLog } from './silent-log.ts';
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
  const log = silentLog();
  return { dir, log, store: createNoteStore(createFileSystem(path.join(tmpdir(), 'b-notes-staging')), dir.replaceAll("\\", "/"), log) };
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

describe('the disambiguating suffix, which is ours and not his', () => {
  it('never stacks one on another', async () => {
    // It did: a first line ending in (1) became part of the name, so the next
    // clash put another on top and `Pismo (1) (1)` was born. His own suffix is
    // stripped, so both of these are the base `Pismo` and get a number each.
    const { dir, store } = await emptyStore();

    await store.save(null, 'Pismo (1)\n\nPrvi.');
    await store.save(null, 'Pismo (1)\n\nDrugi.');

    assert.deepEqual((await readdir(dir)).sort(), ['Pismo (1).txt', 'Pismo (2).txt']);
  });

  it('leaves the title he wrote alone', async () => {
    // Only the file is renamed. What he reads comes from his own words.
    const { store } = await emptyStore();
    await store.save(null, 'Pismo (1)\n\nPrvi.');

    assert.equal((await store.list())[0]?.title, 'Pismo (1)');
  });

  it('does not stack one while putting a .md file into plain text', async () => {
    // About twenty of his arrive from Simplenote already carrying a suffix,
    // and the conversion runs over all of them at the first startup.
    const { dir, store } = await emptyStore();
    await writeFile(path.join(dir, 'Esej.md'), 'Esej\n\nJedan.', 'utf8');
    await writeFile(path.join(dir, 'Esej (1).md'), 'Esej\n\nDva.', 'utf8');
    await writeFile(path.join(dir, 'Esej (1).txt'), 'Esej\n\nTri.', 'utf8');

    await store.convertToPlainText();

    assert.deepEqual((await readdir(dir)).sort(), ['Esej (1).txt', 'Esej (2).txt', 'Esej (3).txt']);
  });

  it('takes every suffix off, so a doubled name heals', () => {
    // Stripping once left the damage in place for good: it survived a save, a
    // delete and a restore, gathering another on every clash.
    assert.equal(baseOf('Pismo (1) (2)'), 'Pismo');
    assert.equal(fileNameBase('Pismo (1) (2)'), 'Pismo');
  });

  it('leaves a bare bracket alone, since the suffix needs its space', () => {
    // A title that is only "(1)" is his writing, and names a file that reads
    // back as itself.
    assert.equal(fileNameBase('(1)'), '(1)');
    assert.equal(baseOf('(1)'), '(1)');
  });
});

describe('a text that will not convert', () => {
  it('says why, not only which', async () => {
    // Held open by Dropbox, already gone, and refused by Windows are three
    // different problems. The name alone makes them one, and the reason is
    // there for the taking at exactly the moment it is thrown away.
    const dir = await mkdtemp(path.join(tmpdir(), 'b-notes-'));
    const real = createFileSystem(path.join(tmpdir(), 'b-notes-staging'));
    const refuses: FileSystem = {
      ...real,
      rename: async () => {
        throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
      },
    };
    await writeFile(path.join(dir, 'Stari zapis.md'), 'Stari zapis\n\nTekst.', 'utf8');
    const store = createNoteStore(refuses, dir.replaceAll('\\', '/'), silentLog());

    const { converted, refused } = await store.convertToPlainText();

    assert.equal(converted, 0);
    assert.equal(refused.length, 1);
    assert.equal(refused[0]?.name, 'Stari zapis.md');
    assert.match(
      JSON.stringify(refused[0]?.failure),
      /EBUSY/,
      'the reason travels with the name',
    );
  });
});

describe('a disk that will not answer', () => {
  it('refuses to answer rather than reporting that he has no copies', async () => {
    // The bug this guards: an unreadable folder and a folder with nothing in it
    // both came out as "no versions kept", so a disk quietly going wrong looked
    // exactly like a text he had never edited.
    const dir = await mkdtemp(path.join(tmpdir(), 'b-notes-'));
    const real = createFileSystem(path.join(tmpdir(), 'b-notes-staging'));
    const refuses: FileSystem = {
      ...real,
      list: async (folder: string) => {
        if (folder.includes(VERSIONS_FOLDER)) throw new Error('EACCES: permission denied');
        return real.list(folder);
      },
    };
    const store = createNoteStore(refuses, dir.replaceAll('\\', '/'), silentLog());
    const id = await store.save(null, 'O zimi\n\nTekst.');

    // It used to answer 0, which is the same answer as a text nobody has ever
    // edited. A folder shut to us is not a folder with nothing in it, and the
    // store now says so rather than choosing a number.
    await assert.rejects(() => store.countVersions(id ?? ''), /permission denied/);
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

  it('takes the copies with it when renaming, so he can still reach them', async () => {
    // The versions folder is named after the note. A retitle that left it
    // behind orphaned every copy he had: the files stayed on disk and nothing
    // in the app could reach them again.
    const { store } = await emptyStore();
    const first = await store.save(null, 'O zimi\n\nTekst.');
    await store.keepCopy(first ?? '', 'O zimi\n\nStariji tekst.');

    const second = await store.save(first, 'O ljetu\n\nTekst.');

    const kept = await store.listVersions(second ?? '');
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.text, 'O zimi\n\nStariji tekst.');
  });

  it('keeps a copy when a rewritten opening line also cuts most of the text', async () => {
    // Both halves of one save: the name changes and a great deal of the text
    // goes — though not so much that it counts as a replacement, which does not
    // rename at all. The rename used to swallow the copy the cut asked for.
    const { store } = await emptyStore();
    const long = `O zimi\n\n${'rec '.repeat(400)}`;
    const first = await store.save(null, long);

    const second = await store.save(first, `O ljetu\n\n${'rec '.repeat(200)}`);

    const kept = await store.listVersions(second ?? '');
    assert.equal(kept.length, 1, 'what he had before the cut');
    assert.equal(kept[0]?.text, long);
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
    assert.equal(await store.save(null, 'O zimi\n\nDva.'), 'O zimi (2)');
  });

  it('numbers the text already there rather than leaving one of two bare', async () => {
    // What he reads in the list is the number on the file. Leaving the first
    // one plain would mean the list numbering it by counting rows, and saying
    // `(1)` about a file called `O zimi.txt`.
    const { dir, store } = await emptyStore();
    await store.save(null, 'O zimi\n\nJedan.');

    await store.save(null, 'O zimi\n\nDva.');

    assert.deepEqual((await readdir(dir)).sort(), ['O zimi (1).txt', 'O zimi (2).txt']);
  });

  it('takes the older text kept copies with it when it is numbered', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nJedan.');
    await store.keepCopy(id ?? '', 'O zimi\n\nNesto starije.');

    await store.save(null, 'O zimi\n\nDva.');

    assert.deepEqual(await readdir(path.join(dir, 'Verzije')), ['O zimi (1)']);
  });

  it('still saves his text when the older one cannot be numbered', async () => {
    // Numbering the other file is housekeeping, and housekeeping is never
    // allowed to cost him the writing that prompted it. A Dropbox sync holding
    // that file open is the everyday version of this.
    const dir = await mkdtemp(path.join(tmpdir(), 'b-notes-'));
    const log = silentLog();
    const disk = createFileSystem(path.join(tmpdir(), 'b-notes-staging'));
    const refusing: FileSystem = {
      ...disk,
      rename: async (from, to) => {
        if (to.endsWith('O zimi (1).txt')) throw new Error('held open elsewhere');
        return disk.rename(from, to);
      },
    };
    const store = createNoteStore(refusing, dir.replaceAll(String.fromCharCode(92), '/'), log);
    await store.save(null, 'O zimi\n\nJedan.');

    assert.equal(await store.save(null, 'O zimi\n\nDva.'), 'O zimi (2)');
    assert.deepEqual((await readdir(dir)).sort(), ['O zimi (2).txt', 'O zimi.txt']);
    assert.ok(log.said.some((line) => line.level === 'warn' && line.message.includes('number')));
  });

  it('does not let the suffix accumulate when a duplicate is edited', async () => {
    const { store } = await emptyStore();
    await store.save(null, 'O zimi\n\nJedan.');

    let id = await store.save(null, 'O zimi\n\nDva.');
    for (let round = 0; round < 5; round += 1) id = await store.save(id, `O zimi\n\nDva. ${round}`);

    assert.equal(id, 'O zimi (2)');
  });

  it('numbers a third duplicate without reusing the second name', async () => {
    const { store } = await emptyStore();
    await store.save(null, 'Ponovljeni\n\nJedan.');
    await store.save(null, 'Ponovljeni\n\nDva.');

    assert.equal(await store.save(null, 'Ponovljeni\n\nTri.'), 'Ponovljeni (3)');
  });

  it('takes the number off the last one left when its siblings are gone', async () => {
    const { dir, store } = await emptyStore();
    // The first save returns `O zimi`; the second numbers it, so by now it is
    // `O zimi (1)`. An id held across a save is an id that may have moved.
    await store.save(null, 'O zimi\n\nJedan.');
    await store.save(null, 'O zimi\n\nDva.');

    await store.moveToDeleted('O zimi (1)');

    // (2) was never renumbered to (1) — numbers do not shuffle. It simply
    // stops being one of several, so it stops carrying a number at all.
    assert.deepEqual((await readdir(dir)).filter((n) => n.endsWith(EXTENSION)), ['O zimi.txt']);
  });

  it('leaves a gap alone while more than one is still there', async () => {
    const { dir, store } = await emptyStore();
    await store.save(null, 'O zimi\n\nJedan.');
    const two = await store.save(null, 'O zimi\n\nDva.');
    await store.save(null, 'O zimi\n\nTri.');

    await store.moveToDeleted(two ?? '');

    assert.deepEqual((await readdir(dir)).filter((n) => n.endsWith(EXTENSION)).sort(), [
      'O zimi (1).txt',
      'O zimi (3).txt',
    ]);
  });

  it('carries the kept copies when the last one loses its number', async () => {
    const { dir, store } = await emptyStore();
    await store.save(null, 'O zimi\n\nJedan.');
    const two = await store.save(null, 'O zimi\n\nDva.');
    await store.keepCopy(two ?? '', 'O zimi\n\nNesto starije.');

    await store.moveToDeleted('O zimi (1)');

    assert.deepEqual(await readdir(path.join(dir, VERSIONS_FOLDER)), ['O zimi']);
  });

  it('settles his list when a text is renamed out of a shared name', async () => {
    const { dir, store } = await emptyStore();
    await store.save(null, 'O zimi\n\nJedan.');
    const two = await store.save(null, 'O zimi\n\nDva.');

    await store.save(two ?? '', 'O ljetu\n\nSad o necem drugom.');

    assert.deepEqual((await readdir(dir)).filter((n) => n.endsWith(EXTENSION)).sort(), [
      'O ljetu.txt',
      'O zimi.txt',
    ]);
  });

  it('settles Obrisano when one of them is destroyed for good', async () => {
    const { dir, store } = await emptyStore();
    await store.save(null, 'O zimi\n\nJedan.');
    await store.save(null, 'O zimi\n\nDva.');
    await store.moveToDeleted('O zimi (1)');
    await store.moveToDeleted('O zimi');

    await store.destroy('O zimi (1)');

    assert.deepEqual(await readdir(path.join(dir, DELETED_FOLDER)), ['O zimi.txt']);
  });

  it('settles Obrisano when a text is brought back out of it', async () => {
    const { dir, store } = await emptyStore();
    await store.save(null, 'O zimi\n\nJedan.');
    await store.save(null, 'O zimi\n\nDva.');
    await store.moveToDeleted('O zimi (1)');
    // Putting the first away left the second alone, so it is plain `O zimi`
    // now. Deleting one text is what renamed the other.
    await store.moveToDeleted('O zimi');

    await store.restore('O zimi (1)');

    assert.deepEqual(await readdir(path.join(dir, DELETED_FOLDER)), ['O zimi.txt']);
  });

  it('puts the whole folder in order at startup, both halves of it', async () => {
    // His corpus arrived from Simplenote as a bare name beside numbered ones,
    // and no save has ever had cause to look at it.
    const { dir, store } = await emptyStore();
    await mkdir(path.join(dir, DELETED_FOLDER), { recursive: true });
    await writeFile(path.join(dir, 'Esej.txt'), 'Esej\n\nJedan.', 'utf8');
    await writeFile(path.join(dir, 'Esej (1).txt'), 'Esej\n\nDva.', 'utf8');
    await writeFile(path.join(dir, 'Sam (4).txt'), 'Sam\n\nJedini.', 'utf8');
    await writeFile(path.join(dir, DELETED_FOLDER, 'Staro (2).txt'), 'Staro\n\nJedno.', 'utf8');

    await store.settleNames();

    assert.deepEqual((await readdir(dir)).filter((n) => n.endsWith(EXTENSION)).sort(), [
      'Esej (1).txt',
      'Esej (2).txt',
      'Sam.txt',
    ]);
    assert.deepEqual(await readdir(path.join(dir, DELETED_FOLDER)), ['Staro.txt']);
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
    const real = createFileSystem(path.join(tmpdir(), 'b-notes-staging'));
    const refusesVersions: FileSystem = {
      ...real,
      write: async (at, text) =>
        at.includes(VERSIONS_FOLDER) ? Promise.reject(new Error('disk full')) : real.write(at, text),
    };
    const store = createNoteStore(refusesVersions, dir.replaceAll('\\', '/'), silentLog());
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
      'Ponovljeni (2).txt',
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

    assert.deepEqual((await readdir(dir)).sort(), ['Esej o zimi (1).txt', 'Esej o zimi (2).txt']);
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
  /** What is in a text's versions folder, or nothing where none was ever made. */
  const versionsOf = async (dir: string, id: string): Promise<string[]> => {
    try {
      return await readdir(path.join(dir, VERSIONS_FOLDER, id));
    } catch {
      // Not logged, and this one really is the expected answer: half of these
      // assert that no copy was kept, so the folder is absent by design.
      return [];
    }
  };

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

describe('the copies kept of one text', () => {
  const ESSAY = `O zimi\n\n${'rec '.repeat(800)}`;

  it('counts none for a text he has only ever written in', async () => {
    const { store } = await emptyStore();
    const id = await store.save(null, ESSAY);

    assert.equal(await store.countVersions(id ?? ''), 0);
    assert.deepEqual(await store.listVersions(id ?? ''), []);
  });

  it('hands back what was there, not what is there now', async () => {
    const { store } = await emptyStore();
    const id = await store.save(null, ESSAY);
    await store.save(id, 'O zimi\n\nSve je otišlo.');

    const [kept] = await store.listVersions(id ?? '');
    assert.equal(kept?.text, ESSAY);
  });

  it('counts without reading them', async () => {
    const { store } = await emptyStore();
    const id = await store.save(null, ESSAY);
    await store.save(id, 'O zimi\n\nKratko.');

    assert.equal(await store.countVersions(id ?? ''), 1);
  });

  it('puts the newest first, even when two share a second', async () => {
    // Their times are equal to the nearest millisecond the app can see, so only
    // their names say which came second.
    const { dir, store } = await emptyStore();
    const id = (await store.save(null, ESSAY)) ?? '';
    const folder = path.join(dir, VERSIONS_FOLDER, id);
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, '2026-01-01 10-00-00.txt'), 'prva', 'utf8');
    await writeFile(path.join(folder, '2026-01-01 10-00-00 (1).txt'), 'druga', 'utf8');

    assert.deepEqual((await store.listVersions(id)).map((kept) => kept.text), ['druga', 'prva']);
  });

  it('refuses a name that points outside his writing folder', async () => {
    const { store } = await emptyStore();

    await assert.rejects(() => store.listVersions('../../secrets'));
    await assert.rejects(() => store.countVersions('../../secrets'));
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

    // The one he wrote while this was away is numbered too, rather than left
    // as the only bare `O zimi` beside a `(1)` he never asked for.
    assert.equal(back, 'O zimi (2)');
    assert.equal(await store.read('O zimi (1)'), 'O zimi\n\nNovi tekst.');
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

describe('keeping a copy because the caller says so', () => {
  const kept = async (dir: string) => readdir(path.join(dir, VERSIONS_FOLDER, 'O zimi'));

  it('keeps one however little is changing', async () => {
    // The ordinary rule would decline — nothing like two hundred characters is
    // going. A restore is not editing, and the dialog has promised otherwise.
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nKratko.');

    await store.keepCopy(id ?? '', 'O zimi\n\nKratko.');

    assert.deepEqual((await kept(dir)).length, 1);
  });

  it('keeps one even when the newest copy already holds nearly all of it', async () => {
    // The rule's second gate, which stops a long cutting session leaving six
    // near-identical copies. It has no business in a restore either.
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nPrvi.');

    await store.keepCopy(id ?? '', 'O zimi\n\nPrvi.');
    await after(1100);
    await store.keepCopy(id ?? '', 'O zimi\n\nPrvi. I jos malo.');

    assert.equal((await kept(dir)).length, 2);
  });

  it('does not keep a second copy of what it is already keeping', async () => {
    // What made a restore breed files: bringing a version back keeps what he
    // had, and what he had is very often a copy already in the folder. Four
    // trips back and forth, four new files, two of every text.
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nPrvi.');

    const first = await store.keepCopy(id ?? '', 'O zimi\n\nPrvi.');
    await after(1100);
    const second = await store.keepCopy(id ?? '', 'O zimi\n\nPrvi.');

    assert.equal((await kept(dir)).length, 1);
    assert.equal(second, first, 'and it says which copy is already holding it');
  });

  it('points at the older copy when that is the one already holding it', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nPrvi.');

    const older = await store.keepCopy(id ?? '', 'O zimi\n\nPrvi.');
    await after(1100);
    await store.keepCopy(id ?? '', 'O zimi\n\nDrugi.');
    await after(1100);
    const again = await store.keepCopy(id ?? '', 'O zimi\n\nPrvi.');

    assert.equal((await kept(dir)).length, 2, 'nothing new written');
    assert.equal(again, older);
  });

  it('writes what it was handed, not what is on disk', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nNa disku.');

    await store.keepCopy(id ?? '', 'O zimi\n\nOno što je bilo u editoru.');

    const [only] = await kept(dir);
    assert.equal(
      await readFile(path.join(dir, VERSIONS_FOLDER, 'O zimi', only ?? ''), 'utf8'),
      'O zimi\n\nOno što je bilo u editoru.',
    );
  });
});

describe('writing brought in from somewhere else', () => {
  const ARCHIVE = 'Arhiva/Stari laptop 2021';

  async function storeWithArchive() {
    const made = await emptyStore();
    await mkdir(path.join(made.dir, ARCHIVE), { recursive: true });
    return made;
  }

  const archived = async (dir: string, name: string, text: string): Promise<void> => {
    await writeFile(path.join(dir, ARCHIVE, `${name}${EXTENSION}`), text, 'utf8');
  };

  it('reports no archives when there is no Arhiva folder', async () => {
    // The ordinary case: only whoever set the app up ever puts one there.
    const { store } = await emptyStore();
    assert.deepEqual(await store.listArchives(), []);
  });

  it('names each archive and counts what is in it', async () => {
    const { dir, store } = await storeWithArchive();
    await archived(dir, 'Pismo', 'Pismo' + '\n\n' + 'Jedno.');
    await archived(dir, 'Drugo', 'Drugo' + '\n\n' + 'Dva.');

    assert.deepEqual(await store.listArchives(), [{ name: 'Stari laptop 2021', texts: 2 }]);
  });

  it('leaves out an archive folder with nothing in it', async () => {
    // A row that opens onto nothing is worse than no row. The folder stays on
    // disk, because whoever made it meant to.
    const { dir, store } = await storeWithArchive();
    await mkdir(path.join(dir, 'Arhiva', 'Prazna'), { recursive: true });
    await archived(dir, 'Pismo', 'Pismo' + '\n\n' + 'Jedno.');

    assert.deepEqual((await store.listArchives()).map((a) => a.name), ['Stari laptop 2021']);
  });

  it('says which archive each text came from, since that is all it has', async () => {
    const { dir, store } = await storeWithArchive();
    await archived(dir, 'Pismo', 'Pismo' + '\n\n' + 'Jedno.');

    const found = await store.listArchived(new Set());
    assert.deepEqual(found.map((note) => [note.archive, note.title]), [['Stari laptop 2021', 'Pismo']]);
  });

  it('marks an archived text he already has one of, by title', async () => {
    const { dir, store } = await storeWithArchive();
    await archived(dir, 'Pismo', 'Pismo' + '\n\n' + 'Staro.');
    await archived(dir, 'Samo ovde', 'Samo ovde' + '\n\n' + 'Nigde drugde.');
    await store.save(null, 'Pismo' + '\n\n' + 'Novo.');

    const live = new Set((await store.list()).map((note) => note.title));
    const found = await store.listArchived(live);

    assert.deepEqual(
      found.map((note) => [note.title, note.alsoLive]).sort(),
      [['Pismo', true], ['Samo ovde', false]],
    );
  });

  it('counts what is kept beside an archived text without reading it', async () => {
    const { dir, store } = await storeWithArchive();
    await archived(dir, 'Pismo', 'Pismo' + '\n\n' + 'Jedno.');
    await mkdir(path.join(dir, ARCHIVE, VERSIONS_FOLDER, 'Pismo'), { recursive: true });
    await writeFile(path.join(dir, ARCHIVE, VERSIONS_FOLDER, 'Pismo', '2021-01-01 10-00-00.txt'), 'Staro', 'utf8');

    assert.equal((await store.listArchived(new Set()))[0]?.versions, 1);
  });

  it('moves a text out of its archive rather than copying it', async () => {
    const { dir, store } = await storeWithArchive();
    await archived(dir, 'Pismo', 'Pismo' + '\n\n' + 'Jedno.');

    assert.equal(await store.bringBack('Stari laptop 2021', 'Pismo'), 'Pismo');

    assert.deepEqual((await readdir(dir)).filter((n) => n.endsWith(EXTENSION)), ['Pismo.txt']);
    assert.deepEqual(await readdir(path.join(dir, ARCHIVE)), []);
  });

  it('numbers both when he already has a text of that name', async () => {
    const { dir, store } = await storeWithArchive();
    await archived(dir, 'Pismo', 'Pismo' + '\n\n' + 'Staro.');
    await store.save(null, 'Pismo' + '\n\n' + 'Novo.');

    assert.equal(await store.bringBack('Stari laptop 2021', 'Pismo'), 'Pismo (2)');

    assert.deepEqual((await readdir(dir)).filter((n) => n.endsWith(EXTENSION)).sort(), [
      'Pismo (1).txt',
      'Pismo (2).txt',
    ]);
  });

  it('brings the copies kept in the archive with it', async () => {
    const { dir, store } = await storeWithArchive();
    await archived(dir, 'Pismo', 'Pismo' + '\n\n' + 'Jedno.');
    await mkdir(path.join(dir, ARCHIVE, VERSIONS_FOLDER, 'Pismo'), { recursive: true });
    await writeFile(path.join(dir, ARCHIVE, VERSIONS_FOLDER, 'Pismo', '2021-01-01 10-00-00.txt'), 'Staro', 'utf8');

    await store.bringBack('Stari laptop 2021', 'Pismo');

    assert.deepEqual(await readdir(path.join(dir, VERSIONS_FOLDER, 'Pismo')), ['2021-01-01 10-00-00.txt']);
    assert.equal(await store.countVersions('Pismo'), 1);
  });

  it('settles the archive it left, so a lone survivor loses its number', async () => {
    const { dir, store } = await storeWithArchive();
    await archived(dir, 'Pismo (1)', 'Pismo' + '\n\n' + 'Jedno.');
    await archived(dir, 'Pismo (2)', 'Pismo' + '\n\n' + 'Dva.');

    await store.bringBack('Stari laptop 2021', 'Pismo (1)');

    assert.deepEqual(await readdir(path.join(dir, ARCHIVE)), ['Pismo.txt']);
  });

  it('puts it at the top of his list, where a text he just asked for belongs', async () => {
    const { dir, store } = await storeWithArchive();
    await store.save(null, 'Raniji' + '\n\n' + 'Pisan juce.');
    // Aged by a day, or the two land in the same millisecond and the order
    // this is about is decided by whichever the folder listed first.
    const yesterday = new Date(Date.now() - 86_400_000);
    await utimes(path.join(dir, `Raniji${EXTENSION}`), yesterday, yesterday);

    await archived(dir, 'Staro', 'Staro' + '\n\n' + 'Iz 2019.');
    const long_ago = new Date(2019, 0, 1);
    await utimes(path.join(dir, ARCHIVE, `Staro${EXTENSION}`), long_ago, long_ago);

    await store.bringBack('Stari laptop 2021', 'Staro');

    assert.equal((await store.list())[0]?.title, 'Staro');
  });

  it('refuses a text that is not in that archive', async () => {
    const { store } = await storeWithArchive();
    await assert.rejects(() => store.bringBack('Stari laptop 2021', 'Nema me'), /No such archived note/);
  });
});

describe('saying when a text changes its name', () => {
  /*
    Saving one text renames others: a second `Pismo` makes the first `Pismo (1)`,
    and a group down to its last takes the number off what is left. Anything
    above holding a text by name has to hear about those, or it goes on pointing
    at a file that is no longer there — which is where every save bug in this
    app has come from.
  */
  async function watchedStore() {
    const dir = await mkdtemp(path.join(tmpdir(), 'b-notes-'));
    const log = silentLog();
    const renames: { from: string; to: string }[] = [];
    const store = createNoteStore(
      createFileSystem(path.join(tmpdir(), 'b-notes-staging')),
      dir.replaceAll(String.fromCharCode(92), '/'),
      log,
      (from, to) => renames.push({ from, to }),
    );
    return { store, renames };
  }

  it('says so when his own first line changed', async () => {
    const { store, renames } = await watchedStore();
    const id = await store.save(null, 'Pismo\n\nDragi brate');
    renames.length = 0;

    // Against what the save itself reports, rather than a guess at the
    // naming rule: the title is built from the start of his text, not from
    // the first line alone.
    const to = await store.save(id, 'Esej\n\nDragi brate');

    assert.deepEqual(renames, [{ from: id, to }]);
  });

  it('says so about the other text, when a second one takes its name', async () => {
    // The one that was silent: nothing was told that `Pismo` had become
    // `Pismo (1)`, because the save that caused it was about another text.
    const { store, renames } = await watchedStore();
    await store.save(null, 'Pismo\n\nPrvi');
    renames.length = 0;

    await store.save(null, 'Pismo\n\nDrugi');

    assert.deepEqual(renames, [{ from: 'Pismo', to: 'Pismo (1)' }]);
  });
});
