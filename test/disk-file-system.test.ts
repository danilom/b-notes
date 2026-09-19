import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { createFileSystem } from '../src/hosts/electron/disk-file-system.ts';

async function emptyFolder(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'b-notes-fs-'));
}

const forwardSlashed = (at: string): string => at.replaceAll('\\', '/');

describe('tidying away a folder', () => {
  const files = createFileSystem();

  it('removes one that has nothing left in it', async () => {
    const root = await emptyFolder();
    await mkdir(path.join(root, 'verzije'));

    await files.removeEmptyFolder(forwardSlashed(path.join(root, 'verzije')));

    assert.deepEqual(await readdir(root), []);
  });

  it('leaves one that still holds a file, whatever it was asked to do', async () => {
    // The guarantee. Nothing in the app should be able to reach a folder of his
    // writing and empty it, so this refuses rather than recurses.
    const root = await emptyFolder();
    await mkdir(path.join(root, 'verzije'));
    await writeFile(path.join(root, 'verzije', 'staro.txt'), 'Nekad.', 'utf8');

    await files.removeEmptyFolder(forwardSlashed(path.join(root, 'verzije')));

    assert.deepEqual(await readdir(path.join(root, 'verzije')), ['staro.txt']);
  });

  it('leaves one that holds a folder, which could hold anything', async () => {
    const root = await emptyFolder();
    await mkdir(path.join(root, 'verzije', 'O zimi'), { recursive: true });

    await files.removeEmptyFolder(forwardSlashed(path.join(root, 'verzije')));

    assert.deepEqual(await readdir(path.join(root, 'verzije')), ['O zimi']);
  });

  it('is content when there is no such folder, since that is the wanted state', async () => {
    const root = await emptyFolder();

    await files.removeEmptyFolder(forwardSlashed(path.join(root, 'nikad-postojala')));

    assert.deepEqual(await readdir(root), []);
  });
});
