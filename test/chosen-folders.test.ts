import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { whereToOpen } from '../src/hosts/electron/chosen-folders.ts';

describe('where the folder picker should open', () => {
  it('opens at the folder itself when it is there', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'b-notes-'));

    assert.equal(whereToOpen(dir), path.normalize(dir));
  });

  it('takes the forward slashes the app keeps paths in', async () => {
    // Everything is stored with them, and this dialog alone among Windows will
    // not take one. Handed one it opened wherever it liked, which read as the
    // current folder being ignored.
    const dir = await mkdtemp(path.join(tmpdir(), 'b-notes-'));

    assert.equal(whereToOpen(dir.replaceAll('\\', '/')), path.normalize(dir));
  });

  it('walks up to the nearest folder that does exist', async () => {
    // His writing folder comes into being on the first save, so on a new
    // machine it is a name rather than a place.
    const dir = await mkdtemp(path.join(tmpdir(), 'b-notes-'));

    assert.equal(whereToOpen(path.join(dir, 'not-here')), path.normalize(dir));
  });

  it('walks up as far as it has to', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'b-notes-'));

    assert.equal(whereToOpen(path.join(dir, 'a', 'b', 'c')), path.normalize(dir));
  });

  it('stops at the root rather than walking for ever', () => {
    // `dirname` of a root is the root, so the walk has to notice and stop.
    const nowhere = path.join(path.parse(process.cwd()).root, 'definitely-not-here-at-all');

    assert.equal(whereToOpen(nowhere), path.parse(process.cwd()).root);
  });
});
