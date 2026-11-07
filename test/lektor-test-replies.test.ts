import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FileMissing, type FileSystem, FolderMissing } from '../src/platform/file-system.ts';
import type { Log } from '../src/platform/logging.ts';
import { savedTestReply } from '../src/ui/lektor/lektor-test-replies.ts';

const FOLDER = 'Podaci/lektor-test-replies';
const quiet: Log = { info: () => undefined, warn: () => undefined, error: () => undefined };

/** Only listing and reading: all the lookup does. */
function filesHolding(stored: ReadonlyMap<string, string> | null): FileSystem {
  const unused = async (): Promise<never> => {
    throw new Error('not used');
  };
  return {
    list: async (folder) => {
      if (stored === null) throw new FolderMissing(folder);
      return [...stored.keys()].map((path) => ({ path, updatedAt: 0, bytes: 0 }));
    },
    read: async (path) => {
      const text = stored?.get(path);
      if (text === undefined) throw new FileMissing(path);
      return text;
    },
    folderExists: async () => stored !== null,
    listFolders: async () => [],
    readStrict: unused,
    write: unused,
    rename: unused,
    removeEmptyFolder: unused,
    removeEmptyFile: unused,
    removeFile: unused,
  };
}

// Saved from Windows, as the real samples are.
const SAVED = new Map([
  [`${FOLDER}/Most.current.txt`, 'Most\r\n\r\nStari most je tu.\r\n'],
  [`${FOLDER}/Most.lektor-rewrite.txt`, 'Most\r\n\r\nStari most još stoji.\r\n'],
]);
const lookUp = (stored: ReadonlyMap<string, string> | null, text: string, preset: 'rewrite' | 'letters' = 'rewrite'): Promise<string | null> =>
  savedTestReply(filesHolding(stored), 'Podaci', quiet, text, preset);

describe('a saved test reply', () => {
  it('is found for the same text pasted into the app, and comes back in its line endings', async () => {
    assert.equal(await lookUp(SAVED, 'Most\n\nStari most je tu.'), 'Most\n\nStari most još stoji.');
  });

  it('keeps Windows line endings where the text has them', async () => {
    assert.equal(await lookUp(SAVED, 'Most\r\n\r\nStari most je tu.\r\n'), 'Most\r\n\r\nStari most još stoji.');
  });

  it('is not given for a text that differs by a word', async () => {
    assert.equal(await lookUp(SAVED, 'Most\n\nStari most je ovde.'), null);
  });

  it('is not given for a kind nobody saved, nor where there is no folder', async () => {
    assert.equal(await lookUp(SAVED, 'Most\n\nStari most je tu.', 'letters'), null);
    assert.equal(await lookUp(null, 'Most\n\nStari most je tu.'), null);
  });
});
