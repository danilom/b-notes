import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { FileSystem } from '../src/platform/file-system.ts';
import { readSession, writeSession } from '../src/ui/app-session.ts';

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

    assert.deepEqual(await readSession(files, FOLDER), { openNoteId: null });
  });

  it('opens with nothing when the file is not JSON at all', async () => {
    assert.deepEqual(await readSession(holding('{ half a fi'), FOLDER), { openNoteId: null });
  });

  it('opens the text it names', async () => {
    const saved = JSON.stringify({ openNoteId: 'O zimi' });

    assert.deepEqual(await readSession(holding(saved), FOLDER), { openNoteId: 'O zimi' });
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
      assert.deepEqual(await readSession(holding(text), FOLDER), { openNoteId: null });
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

      assert.deepEqual(await readSession(holding(saved), FOLDER), { openNoteId: null });
    });
  }

  it('reads back what it wrote', async () => {
    const { files } = filesHolding({});

    await writeSession(files, FOLDER, { openNoteId: 'O zimi' });

    assert.deepEqual(await readSession(files, FOLDER), { openNoteId: 'O zimi' });
  });

  it('reads back nothing open, once he has closed everything', async () => {
    const { files } = filesHolding({});

    await writeSession(files, FOLDER, { openNoteId: null });

    assert.deepEqual(await readSession(files, FOLDER), { openNoteId: null });
  });

  it('writes it where the app keeps its own files, not among his texts', async () => {
    const { files, stored } = filesHolding({});

    await writeSession(files, FOLDER, { openNoteId: 'O zimi' });

    assert.deepEqual([...stored.keys()], [`${FOLDER}/session.json`]);
  });
});
