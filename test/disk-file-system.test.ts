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

describe('removing a file with nothing in it', () => {
  const files = createFileSystem();

  it('removes one that is empty', async () => {
    const root = await emptyFolder();
    await writeFile(path.join(root, 'prazan.txt'), '', 'utf8');

    assert.equal(await files.removeEmptyFile(forwardSlashed(path.join(root, 'prazan.txt'))), true);
    assert.deepEqual(await readdir(root), []);
  });

  it('removes one holding only spaces and newlines, which is not writing', async () => {
    const root = await emptyFolder();
    await writeFile(path.join(root, 'prazan.txt'), '   \n\n  \t ', 'utf8');

    assert.equal(await files.removeEmptyFile(forwardSlashed(path.join(root, 'prazan.txt'))), true);
    assert.deepEqual(await readdir(root), []);
  });

  it('leaves one with his writing in it, whatever it was asked to do', async () => {
    // The guarantee. This is the only thing in the app that can destroy a file,
    // so what it refuses matters more than what it does.
    const root = await emptyFolder();
    await writeFile(path.join(root, 'tekst.txt'), 'Nekad davno.', 'utf8');

    assert.equal(await files.removeEmptyFile(forwardSlashed(path.join(root, 'tekst.txt'))), false);
    assert.deepEqual(await readdir(root), ['tekst.txt']);
  });

  it('leaves one holding a single character', async () => {
    const root = await emptyFolder();
    await writeFile(path.join(root, 'tekst.txt'), 'a', 'utf8');

    assert.equal(await files.removeEmptyFile(forwardSlashed(path.join(root, 'tekst.txt'))), false);
    assert.deepEqual(await readdir(root), ['tekst.txt']);
  });

  it('says no for a file that is not there, rather than throwing', async () => {
    const root = await emptyFolder();

    assert.equal(await files.removeEmptyFile(forwardSlashed(path.join(root, 'nema.txt'))), false);
  });
});

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
