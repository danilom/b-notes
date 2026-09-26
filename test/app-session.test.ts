import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { FileSystem } from '../src/platform/file-system.ts';
import { readSession, sessionFrom, writeSession } from '../src/ui/settings/app-session.ts';

const FOLDER = 'Podaci';

/** A filesystem holding whatever the test put in it, and nothing else. */
function filesHolding(contents: Record<string, string>) {
  const stored = new Map(Object.entries(contents));
  const files: FileSystem = {
    list: async () => [...stored.keys()].map((path) => ({ path, updatedAt: 0, bytes: 0 })),
    folderExists: async () => true,
    listFolders: async () => [],
    read: async (path) => {
      const text = stored.get(path);
      if (text === undefined) throw new Error(`no such file: ${path}`);
      return text;
    },
    write: async (path, text) => {
      stored.set(path, text);
    },
    rename: async () => {
      throw new Error('not used');
    },
    removeEmptyFolder: async () => {
      throw new Error('not used');
    },
    removeEmptyFile: async () => {
      throw new Error('not used');
    },
    removeFile: async () => {
      throw new Error('not used');
    },
  };
  return { files, stored };
}

const holding = (text: string) => filesHolding({ [`${FOLDER}/session.json`]: text }).files;

describe('what he was last reading', () => {
  it('opens with nothing when there is no session file', async () => {
    // Safe to delete: a worse morning than usual, and no worse than that.
    const { files } = filesHolding({});

    assert.deepEqual(await readSession(files, FOLDER), { openNoteId: null, place: null });
  });

  it('opens with nothing when the file is not JSON at all', async () => {
    assert.deepEqual(await readSession(holding('{ half a fi'), FOLDER), { openNoteId: null, place: null });
  });

  it('opens the text it names', async () => {
    const saved = JSON.stringify({ openNoteId: 'O zimi', place: null });

    assert.deepEqual(await readSession(holding(saved), FOLDER), { openNoteId: 'O zimi', place: null });
  });

  for (const [what, text] of [
    ['a string', '"O zimi"'],
    ['a number', '41'],
    ['null', 'null'],
    ['a list', '["O zimi"]'],
    ['an object without it', '{"something": "else"}'],
    ['a number where the name goes', '{"openNoteId": 41}'],
    ['nothing where the name goes', '{"openNoteId": null}'],
  ] as const) {
    it(`opens with nothing when the file holds ${what}`, async () => {
      assert.deepEqual(await readSession(holding(text), FOLDER), { openNoteId: null, place: null });
    });
  }

  /*
    The id is checked rather than trusted. This file outlives the note it names
    and is written by a program, so the one thing it must never do is hand
    something back that the app will turn into a path.
  */
  for (const [what, id] of [
    ['climbing out of his folder', '../../secrets'],
    ['climbing out the Windows way', '..\\..\\secrets'],
    ['naming a folder below', 'Obrisano/O zimi'],
    ['a filename rather than a name', 'O zimi.txt'],
    ['a filename in another format', 'O zimi.md'],
    ['padded with space', ' O zimi '],
    ['empty', ''],
  ] as const) {
    it(`refuses a name ${what}`, async () => {
      const saved = JSON.stringify({ openNoteId: id });

      assert.deepEqual(await readSession(holding(saved), FOLDER), { openNoteId: null, place: null });
    });
  }

  it('reads back what it wrote', async () => {
    const { files } = filesHolding({});

    await writeSession(files, FOLDER, { openNoteId: 'O zimi', place: null });

    assert.deepEqual(await readSession(files, FOLDER), { openNoteId: 'O zimi', place: null });
  });

  it('reads back nothing open, once he has closed everything', async () => {
    const { files } = filesHolding({});

    await writeSession(files, FOLDER, { openNoteId: null, place: null });

    assert.deepEqual(await readSession(files, FOLDER), { openNoteId: null, place: null });
  });

  it('writes it where the app keeps its own files, not among his texts', async () => {
    const { files, stored } = filesHolding({});

    await writeSession(files, FOLDER, { openNoteId: 'O zimi', place: null });

    assert.deepEqual([...stored.keys()], [`${FOLDER}/session.json`]);
  });
});

/**
 * The place he was reading at is written beside the text he was in, and the two
 * are not worth the same. Losing the place costs him a scroll; losing the text
 * is the app forgetting what he was doing — so a nonsense offset must not take
 * the text down with it.
 */
describe('where he was in the text he was in', () => {
  it('keeps the caret and the scroll it was given', () => {
    assert.deepEqual(sessionFrom({ openNoteId: 'O zimi', place: { caret: 2480, scrollTop: 1360 } }), {
      openNoteId: 'O zimi',
      place: { caret: 2480, scrollTop: 1360 },
    });
  });

  for (const [what, held] of [
    ['a negative offset', -1],
    ['something that is not a number', 'pola'],
    ['a number that is not one', Number.NaN],
    ['an offset past any text', Number.POSITIVE_INFINITY],
  ] as const) {
    it(`still opens his text when the file holds ${what}`, () => {
      const read = sessionFrom({ openNoteId: 'O zimi', place: { caret: held, scrollTop: held } });

      assert.equal(read.openNoteId, 'O zimi');
      assert.equal(read.place, null);
    });
  }

  /*
    The distinction the caller acts on. Nothing written down is not the same as
    the top of the text: one is a file that has not been asked yet, the other is
    a statement about where he was — and the first must not put a caret on his
    opening line, which is the name of the file.
  */
  it('says it does not know, rather than saying the top', () => {
    assert.equal(sessionFrom({ openNoteId: 'O zimi' }).place, null);
  });

  it('says it does not know when only half a place was written', () => {
    assert.equal(sessionFrom({ openNoteId: 'O zimi', place: { caret: 40 } }).place, null);
  });

  it('reads the top as the top, once something has said so', () => {
    assert.deepEqual(sessionFrom({ openNoteId: 'O zimi', place: { caret: 0, scrollTop: 0 } }).place, {
      caret: 0,
      scrollTop: 0,
    });
  });

  it('opens nothing when the name itself is not one', () => {
    assert.equal(sessionFrom({ openNoteId: '../drugde', place: { caret: 10, scrollTop: 10 } }).openNoteId, null);
  });

  it('rounds a fraction rather than refusing it', () => {
    assert.equal(
      sessionFrom({ openNoteId: 'O zimi', place: { caret: 0, scrollTop: 1360.5 } }).place?.scrollTop,
      1360,
    );
  });
});
