import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parentFolder } from '../src/platform/parent-folder.ts';

describe('parentFolder', () => {
  it('gives the folder a folder is in', () => {
    assert.equal(parentFolder('C:/Users/x/Dropbox/b-notes'), 'C:/Users/x/Dropbox');
  });

  it('gives a drive root with its slash, which names the drive rather than a folder on it', () => {
    assert.equal(parentFolder('E:/b-notes-texts'), 'E:/');
  });

  it('ignores a trailing slash', () => {
    assert.equal(parentFolder('D:/texts/b-notes/'), 'D:/texts');
  });

  it('reads backslashes the same as forward slashes', () => {
    assert.equal(parentFolder('E:\\b-notes-texts'), 'E:/');
  });

  it('gives a root as its own parent', () => {
    assert.equal(parentFolder('E:/'), 'E:/');
    assert.equal(parentFolder('/'), '/');
  });

  it('gives the root of a path off the root', () => {
    assert.equal(parentFolder('/home'), '/');
  });

  it('gives a bare drive its root', () => {
    assert.equal(parentFolder('E:'), 'E:/');
  });

  it('gives a bare name the root of the pretend disk', () => {
    assert.equal(parentFolder('b-notes'), '');
  });
});
