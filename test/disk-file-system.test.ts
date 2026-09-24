import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
  createFileSystem,
  halfWrittenCopyFor,
} from '../src/hosts/electron/disk-file-system.ts';

async function emptyFolder(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'b-notes-fs-'));
}

const forwardSlashed = (at: string): string => at.replaceAll('\\', '/');

describe('removing a file with nothing in it', () => {
  const files = createFileSystem(path.join(tmpdir(), 'b-notes-staging'));

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
  const files = createFileSystem(path.join(tmpdir(), 'b-notes-staging'));

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

/**
 * Where the half-written copy waits.
 *
 * It used to wait beside its destination, which is inside the folder he syncs.
 * Dropbox opens files the moment they appear, and a handle held without
 * FILE_SHARE_DELETE fails the rename — so the temporary copy was a way of
 * causing the failure it exists to survive, besides syncing a create and a
 * delete for every autosave.
 */
describe('writing a file', () => {
  it('leaves nothing of its own in the folder he syncs', async () => {
    const root = await emptyFolder();
    const staging = await emptyFolder();
    const files = createFileSystem(staging);

    await files.write(forwardSlashed(path.join(root, 'Pismo.txt')), 'Dragi brate');

    assert.deepEqual(await readdir(root), ['Pismo.txt']);
    assert.equal(await readFile(path.join(root, 'Pismo.txt'), 'utf8'), 'Dragi brate');
  });

  it('leaves nothing waiting in the staging folder when the write cannot be finished', async () => {
    /*
      A directory standing where the file should go: the copy is written, and
      the rename over it is refused. A real refusal from the real filesystem,
      rather than a fake agreeing with what we already believe.
    */
    const root = await emptyFolder();
    const staging = await emptyFolder();
    const blocked = path.join(root, 'Pismo.txt');
    await mkdir(blocked, { recursive: true });
    const files = createFileSystem(staging);

    await assert.rejects(() => files.write(forwardSlashed(blocked), 'Dragi brate'));

    assert.deepEqual(await readdir(staging), []);
    assert.deepEqual(await readdir(root), ['Pismo.txt']);
  });

  it('leaves nothing behind in his own folder when it had to write there', async () => {
    // The fallback path: staging is impossible, so the copy waits beside its
    // destination — which is his folder, where a corpse would be visible.
    const root = await emptyFolder();
    const impossible = await emptyFolder();
    await writeFile(path.join(impossible, 'not-a-folder'), '', 'utf8');
    const blocked = path.join(root, 'Pismo.txt');
    await mkdir(blocked, { recursive: true });
    const files = createFileSystem(path.join(impossible, 'not-a-folder', 'saving'));

    await assert.rejects(() => files.write(forwardSlashed(blocked), 'Dragi brate'));

    assert.deepEqual(await readdir(root), ['Pismo.txt']);
  });

  it('writes beside the destination when it cannot stage elsewhere', async () => {
    // Staging is an improvement on writing beside the destination, never a
    // condition of it: an unusable staging folder must not stop a save.
    const root = await emptyFolder();
    const impossible = await emptyFolder();
    await writeFile(path.join(impossible, 'not-a-folder'), '', 'utf8');
    const files = createFileSystem(path.join(impossible, 'not-a-folder', 'saving'));

    await files.write(forwardSlashed(path.join(root, 'Pismo.txt')), 'Dragi brate');

    assert.deepEqual(await readdir(root), ['Pismo.txt']);
  });
});

describe('where a half-written copy waits', () => {
  it('waits outside the folder he syncs', async () => {
    // The point of the whole arrangement: Dropbox never sees a file of ours
    // appear in his folder, so it can never hold one open across the rename.
    const root = await emptyFolder();
    const staging = await emptyFolder();

    const temp = await halfWrittenCopyFor(forwardSlashed(path.join(root, 'Pismo.txt')), staging);

    assert.equal(path.dirname(temp), staging);
    assert.equal(forwardSlashed(temp).startsWith(forwardSlashed(root)), false);
  });

  it('waits beside its destination when it cannot wait anywhere else', async () => {
    const root = await emptyFolder();
    const impossible = await emptyFolder();
    await writeFile(path.join(impossible, 'not-a-folder'), '', 'utf8');

    const temp = await halfWrittenCopyFor(
      forwardSlashed(path.join(root, 'Pismo.txt')),
      path.join(impossible, 'not-a-folder', 'saving'),
    );

    assert.equal(forwardSlashed(path.dirname(temp)), forwardSlashed(root));
  });

  it('gives two copies waiting at once names of their own', async () => {
    // One folder now holds the copies for every note, where each used to sit
    // beside its own destination and could not collide with anything.
    const root = await emptyFolder();
    const staging = await emptyFolder();

    const first = await halfWrittenCopyFor(forwardSlashed(path.join(root, 'Pismo.txt')), staging);
    const second = await halfWrittenCopyFor(forwardSlashed(path.join(root, 'Esej.txt')), staging);

    assert.notEqual(first, second);
  });
});
