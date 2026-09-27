import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { notesFolderFor, readChosenFolders, whereToOpen, writeChosenFolders } from '../src/hosts/electron/chosen-folders.ts';

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

describe('the folders someone chose', () => {
  it('reads back the Resoph folder, b-notes folder and logs', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'b-notes-'));
    writeChosenFolders(dir, { resoph: 'C:/Dropbox/ResophNotes', notes: 'C:/Dropbox/b-notes', logs: null });

    assert.deepEqual(readChosenFolders(dir), {
      resoph: 'C:/Dropbox/ResophNotes',
      notes: 'C:/Dropbox/b-notes',
      logs: null,
    });
  });

  it('ignores the folder 0.7.0 kept, which points at his Resoph folder', async () => {
    // Honouring it would have the first start write straight into the folder
    // Resoph mirrors.
    const dir = await mkdtemp(path.join(tmpdir(), 'b-notes-'));
    await writeFile(
      path.join(dir, 'folders.json'),
      JSON.stringify({ writing: 'C:/Users/Brano/Dropbox/ResophNotes_Brano', logs: 'C:/logs' }),
      'utf8',
    );

    assert.deepEqual(readChosenFolders(dir), { resoph: null, notes: null, logs: 'C:/logs' });
  });

  it('starts from nothing chosen when the file is unreadable', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'b-notes-'));
    await writeFile(path.join(dir, 'folders.json'), '{ not json', 'utf8');

    assert.deepEqual(readChosenFolders(dir), { resoph: null, notes: null, logs: null });
  });
});

describe("where b-notes' own folder is", () => {
  it('goes beside his Resoph folder when nobody chose one', () => {
    assert.deepEqual(notesFolderFor('C:/Users/Brano/Dropbox/ResophNotes_Brano', null, 'C:/Docs'), {
      folder: 'C:/Users/Brano/Dropbox/b-notes',
      refused: null,
    });
  });

  it('goes in Documents on a machine without Resoph', () => {
    assert.deepEqual(notesFolderFor(null, null, 'C:/Docs'), { folder: 'C:/Docs/b-notes', refused: null });
  });

  it('is the one chosen, when that is somewhere else', () => {
    assert.deepEqual(notesFolderFor('C:/Dropbox/Resoph', 'C:/Dropbox/Moje', 'C:/Docs'), {
      folder: 'C:/Dropbox/Moje',
      refused: null,
    });
  });

  it('is never his Resoph folder, or inside it, whatever was chosen', () => {
    // Resoph lists subfolders and puts back what it remembers: b-notes writing
    // there is the thing this whole design exists to prevent.
    assert.deepEqual(notesFolderFor('C:/Dropbox/Resoph', 'c:/dropbox/resoph/', 'C:/Docs'), {
      folder: 'C:/Dropbox/b-notes',
      refused: 'c:/dropbox/resoph/',
    });
    assert.deepEqual(notesFolderFor('C:/Dropbox/Resoph', 'C:/Dropbox/Resoph/b-notes', 'C:/Docs').refused, 'C:/Dropbox/Resoph/b-notes');
  });

  it('may sit beside a folder whose name merely starts the same', () => {
    assert.equal(notesFolderFor('C:/Dropbox/Resoph', 'C:/Dropbox/Resoph-b', 'C:/Docs').refused, null);
  });
});
