import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { setTimeout as after } from 'node:timers/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

import { createFileSystem } from '../src/hosts/electron/disk-file-system.ts';
import type { FileSystem } from '../src/platform/file-system.ts';
import { CHANGED_ELSEWHERE, createNoteStore } from '../src/notes/note-store.ts';
import { silentLog } from './silent-log.ts';
import {
  DELETED_FOLDER,
  EXTENSION,
  VERSIONS_FOLDER,
  newNameFor,
  putAwayVersionsFolderFor,
  versionName,
} from '../src/notes/note-naming.ts';
import { toSearchable } from '../src/language/diacritics.ts';

/**
 * The shared note store on top of the real filesystem — the combination the
 * installed app actually runs.
 */
async function emptyStore() {
  const dir = await mkdtemp(path.join(tmpdir(), 'b-notes-'));
  const log = silentLog();
  const store = createNoteStore(
    createFileSystem(path.join(tmpdir(), 'b-notes-staging')),
    dir.replaceAll('\\', '/'),
    log,
    undefined,
    NAMING,
  );
  return { dir, log, store };
}

/** Held still, so the name a new text gets is known in advance. */
const STARTED = new Date(2026, 8, 27, 10, 0, 0);
const NAMING = { machine: 'Test', now: () => STARTED };

/** What a text he starts with this first line is called. */
const named = (title: string): string => newNameFor(title, STARTED, 'Test');

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

  it('still saves a text whose folder cannot be listed, since saving it needs only its own file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'b-notes-'));
    const real = createFileSystem(path.join(tmpdir(), 'b-notes-staging'));
    let listing = true;
    const refuses: FileSystem = {
      ...real,
      list: async (folder: string) => {
        if (!listing) throw new Error('EACCES: permission denied');
        return real.list(folder);
      },
    };
    const store = createNoteStore(refuses, dir.replaceAll('\\', '/'), silentLog());
    const id = (await store.save(null, 'O zimi\n\nTekst.')) ?? '';

    listing = false;
    await store.save(id, 'O zimi\n\nTekst. Dopisano.');

    assert.equal(await readFile(path.join(dir, `${id}${EXTENSION}`), 'utf8'), 'O zimi\n\nTekst. Dopisano.');
  });
});

describe('saving', () => {
  it('creates a note named after his first line', async () => {
    const { store } = await emptyStore();

    assert.equal(await store.save(null, 'O zimi\n\nTekst.'), named('O zimi'));
  });

  it('refuses to create anything for an empty new note', async () => {
    const { dir, store } = await emptyStore();

    assert.equal(await store.save(null, '   \n\n'), null);
    assert.deepEqual(await readdir(dir), []);
  });

  it('leaves the filename alone when the first line has not changed', async () => {
    const { store } = await emptyStore();
    const first = await store.save(null, 'O zimi\n\nTekst.');

    assert.equal(await store.save(first, 'O zimi\n\nDrugi tekst.'), first);
  });

  it('emptying an existing note keeps the file, since that is how he deletes', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nTekst.');

    await store.save(id, '');

    assert.deepEqual(
      (await readdir(dir)).filter((name) => name.endsWith(EXTENSION)),
      [`${named('O zimi')}.txt`],
    );
  });

  it('keeps what he emptied, since emptying is the one edit that leaves nothing', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nSve što je napisao.');

    await store.save(id, '');

    const kept = await readdir(path.join(dir, VERSIONS_FOLDER, named('O zimi')));
    assert.equal(kept.length, 1);
    assert.equal(
      await readFile(path.join(dir, VERSIONS_FOLDER, named('O zimi'), kept[0] ?? ''), 'utf8'),
      'O zimi\n\nSve što je napisao.',
    );
  });

  it('does not keep a version of a note that was already empty', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nTekst.');
    await store.save(id, '');
    await store.save(id, '');

    assert.equal((await readdir(path.join(dir, VERSIONS_FOLDER, named('O zimi')))).length, 1);
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

    const moved = await readdir(path.join(dir, DELETED_FOLDER, VERSIONS_FOLDER, named('O zimi')));
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

    const theirs = await readdir(path.join(dir, VERSIONS_FOLDER, named('O zimi')));
    assert.equal(theirs.length, 1);
    assert.equal(
      await readFile(path.join(dir, VERSIONS_FOLDER, named('O zimi'), theirs[0] ?? ''), 'utf8'),
      'O zimi\n\nSasvim drugi tekst.',
    );
  });

  it('emptying a note keeps its name, which is all that is left of it', async () => {
    const { store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nTekst.');

    assert.equal(await store.save(id, ''), named('O zimi'));
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

describe('moving a note out of the way', () => {
  it('puts it in the deleted folder', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nTekst.');

    await store.moveToDeleted(id ?? '');

    assert.deepEqual(await readdir(path.join(dir, DELETED_FOLDER)), [`${named('O zimi')}.txt`]);
    assert.equal((await readdir(dir)).includes(`${named('O zimi')}.txt`), false);
  });

  it('keeps the name it had, which after an emptying is all that is left', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nTekst.');
    await store.save(id, '');

    await store.moveToDeleted(id ?? '');

    assert.deepEqual(await readdir(path.join(dir, DELETED_FOLDER)), [`${named('O zimi')}.txt`, VERSIONS_FOLDER]);
  });

  it('keeps both when a deleted note of that name is already there', async () => {
    const { dir, store } = await emptyStore();
    const first = await store.save(null, 'Ponovljeni\n\nJedan.');
    await store.moveToDeleted(first ?? '');
    const second = await store.save(null, 'Ponovljeni\n\nDva.');

    await store.moveToDeleted(second ?? '');

    // Both were started at the same held moment, so both wanted one name.
    assert.deepEqual((await readdir(path.join(dir, DELETED_FOLDER))).sort(), [
      `${named('Ponovljeni')} 2.txt`,
      `${named('Ponovljeni')}.txt`,
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

  /*
    "Recent" is judged against LONG_AGO, not against a reading of the clock
    taken just before. This machine's clock has been seen to step, and a
    sample of it taken a moment before a write came out more than a second
    after the file's own time — so a test asking "is it at least as late as
    just now" failed about one full run in eight, on nothing but the clock.
    What is being checked is that the file was touched rather than left at its
    old date, and a year is a margin no clock steps across.
  */
  const touchedSince = (updatedAt: number | undefined): boolean =>
    (updatedAt ?? 0) > LONG_AGO.getTime() + 365 * 86_400_000;

  it('says when he put it away, not when he last wrote in it', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'Stari\n\nPisan davno.');
    await utimes(path.join(dir, `${named('Stari')}.txt`), LONG_AGO, LONG_AGO);

    await store.moveToDeleted(id ?? '');

    const [put] = await store.listDeleted();
    assert.ok(
      touchedSince(put?.updatedAt),
      `said ${new Date(put?.updatedAt ?? 0).toISOString()}, which is when it was written, not when it was put away`,
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
    await utimes(path.join(dir, `${named('Stari')}.txt`), LONG_AGO, LONG_AGO);
    await store.moveToDeleted(old ?? '');

    assert.deepEqual((await store.listDeleted()).map((note) => note.title), ['Stari', 'Noviji']);
  });

  it('comes back as recently touched, since he has just asked for it', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'Stari\n\nPisan davno.');
    await store.moveToDeleted(id ?? '');
    // Aged where it lies in Obrisano, after the move: putting it away touches
    // the file too, and aged before that, this would pass whether or not the
    // restore touched anything.
    await utimes(path.join(dir, DELETED_FOLDER, `${named('Stari')}.txt`), LONG_AGO, LONG_AGO);

    const back = await store.restore(id ?? '');

    const found = (await store.list()).find((note) => note.id === back);
    assert.ok(touchedSince(found?.updatedAt), 'a restored text is not stale');
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
      await readFile(path.join(dir, DELETED_FOLDER, `${named('O zimi')}.txt`), 'utf8'),
      'O zimi\n\nSve sto je napisao o zimi.',
    );
  });

  it('keeps the copy it was filed from, beside it under Obrisano', async () => {
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nSve sto je napisao o zimi.');
    await store.save(id, '');

    await store.moveToDeleted(id ?? '');

    const kept = await readdir(path.join(dir, DELETED_FOLDER, VERSIONS_FOLDER, named('O zimi')));
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
    assert.equal(counted.get(named('O zimi')), 1);
    assert.equal(counted.get(named('O jeseni')), 0);
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

    assert.equal(back, named('O zimi'));
    assert.equal(await store.read(back), 'O zimi\n\nTekst.');
    assert.deepEqual(await store.listDeleted(), []);
  });

  it('does not overwrite a text he has written since, under the same name', async () => {
    const { store } = await emptyStore();
    const first = await store.save(null, 'O zimi\n\nStari tekst.');
    await store.moveToDeleted(first ?? '');
    await store.save(null, 'O zimi\n\nNovi tekst.');

    const back = await store.restore(first ?? '');

    // Nothing he wrote meanwhile is renamed to make room: the one coming back
    // steps round it instead.
    assert.equal(back, `${named('O zimi')} 2`);
    assert.equal(await store.read(named('O zimi')), 'O zimi\n\nNovi tekst.');
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

  it('shows conflicted copies, since Dropbox made them of his writing', async () => {
    // Hidden, the one text Dropbox had to split is a text he has lost.
    const { dir, store } = await emptyStore();
    await store.save(null, 'Esej o zimi\n\nTekst.');
    await writeFile(path.join(dir, "Esej (Brano's conflicted copy 2026-09-18).txt"), 'Esej o zimi\n\nDrugi.', 'utf8');

    assert.deepEqual(
      (await store.list()).map((note) => note.text).sort(),
      ['Esej o zimi\n\nDrugi.', 'Esej o zimi\n\nTekst.'],
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
  const kept = async (dir: string) => readdir(path.join(dir, VERSIONS_FOLDER, named('O zimi')));

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
      await readFile(path.join(dir, VERSIONS_FOLDER, named('O zimi'), only ?? ''), 'utf8'),
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

  it('brings the copies kept in the archive with it', async () => {
    const { dir, store } = await storeWithArchive();
    await archived(dir, 'Pismo', 'Pismo' + '\n\n' + 'Jedno.');
    await mkdir(path.join(dir, ARCHIVE, VERSIONS_FOLDER, 'Pismo'), { recursive: true });
    await writeFile(path.join(dir, ARCHIVE, VERSIONS_FOLDER, 'Pismo', '2021-01-01 10-00-00.txt'), 'Staro', 'utf8');

    await store.bringBack('Stari laptop 2021', 'Pismo');

    assert.deepEqual(await readdir(path.join(dir, VERSIONS_FOLDER, 'Pismo')), ['2021-01-01 10-00-00.txt']);
    assert.equal(await store.countVersions('Pismo'), 1);
  });

  it('puts it at the top of his list, where a text he just asked for belongs', async () => {
    const { dir, store } = await storeWithArchive();
    await store.save(null, 'Raniji' + '\n\n' + 'Pisan juce.');
    // Aged by a day, or the two land in the same millisecond and the order
    // this is about is decided by whichever the folder listed first.
    const yesterday = new Date(Date.now() - 86_400_000);
    await utimes(path.join(dir, `${named('Raniji')}${EXTENSION}`), yesterday, yesterday);

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


describe('a text changed on disk behind b-notes', () => {
  it('keeps what was there before writing his words over it', async () => {
    // Another machine's edit arriving through Dropbox while b-notes is open,
    // or Notepad saving: his words in the box win, the other is kept.
    const { dir, store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nPrvo.');
    await store.list();
    await writeFile(path.join(dir, `${id ?? ''}.txt`), 'O zimi\n\nNapisano na drugom racunaru.', 'utf8');

    await store.save(id, 'O zimi\n\nPrvo, pa jos.');

    const kept = await store.listVersions(id ?? '');
    assert.ok(kept.some((version) => version.text === 'O zimi\n\nNapisano na drugom racunaru.'), 'the other text was lost');
    assert.ok(kept.some((version) => version.id.endsWith(CHANGED_ELSEWHERE)));
    assert.equal(await store.read(id ?? ''), 'O zimi\n\nPrvo, pa jos.');
  });

  it('keeps nothing when the file is as b-notes left it', async () => {
    const { store } = await emptyStore();
    const id = await store.save(null, 'O zimi\n\nPrvo.');
    await store.list();

    await store.save(id, 'O zimi\n\nPrvo, pa jos.');

    assert.deepEqual(await store.listVersions(id ?? ''), []);
    assert.equal((await store.list()).length, 1);
  });
});
