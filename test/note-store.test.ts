import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { createFileNoteStore, isConflictedCopy, toFileName } from '../src/main/note-store.ts';

async function emptyStore() {
  const dir = await mkdtemp(path.join(tmpdir(), 'b-notes-'));
  return { dir, store: createFileNoteStore(dir) };
}

describe('isConflictedCopy', () => {
  it('recognises the name Dropbox gives a sync collision', () => {
    assert.equal(isConflictedCopy("Essay (Brano's conflicted copy 2026-09-18).md"), true);
  });

  it('recognises a same-day second collision', () => {
    assert.equal(isConflictedCopy("Essay (Brano's conflicted copy 2026-09-18 2).md"), true);
  });

  it('leaves an ordinary name alone', () => {
    assert.equal(isConflictedCopy('Essay about ducks.md'), false);
  });

  it('does not match prose that merely uses the words', () => {
    assert.equal(isConflictedCopy('On the conflicted copy as a literary device.md'), false);
  });
});

describe('toFileName', () => {
  it('keeps an ordinary title intact', () => {
    assert.equal(toFileName('On winter light'), 'On winter light.md');
  });

  it('replaces characters Windows refuses', () => {
    assert.equal(toFileName('Why?  Because: it/works'), 'Why Because it works.md');
  });

  it('falls back when nothing usable is left', () => {
    assert.equal(toFileName('///'), 'Untitled.md');
  });

  it('escapes names reserved by Windows', () => {
    assert.equal(toFileName('CON'), '_CON.md');
  });

  it('drops trailing dots, which Windows would silently strip', () => {
    assert.equal(toFileName('Chapter one...'), 'Chapter one.md');
  });
});

describe('createFileNoteStore', () => {
  it('round-trips a note through create, write and read', async () => {
    const { store } = await emptyStore();

    const id = await store.create('First essay');
    await store.write(id, 'Some text.');

    assert.equal(await store.read(id), 'Some text.');
  });

  it('starts a new note empty', async () => {
    const { store } = await emptyStore();

    const id = await store.create('First essay');

    assert.equal(await store.read(id), '');
  });

  it('gives a second note of the same title its own file', async () => {
    const { store } = await emptyStore();

    const first = await store.create('Essay');
    const second = await store.create('Essay');

    assert.notEqual(first, second);
  });

  it('lists created notes', async () => {
    const { store } = await emptyStore();
    await store.create('Essay');

    const notes = await store.list();

    assert.deepEqual(
      notes.map((note) => note.title),
      ['Essay'],
    );
  });

  it('hides conflicted copies from the list', async () => {
    const { dir, store } = await emptyStore();
    await store.create('Essay');
    await writeFile(path.join(dir, "Essay (Brano's conflicted copy 2026-09-18).md"), 'other', 'utf8');

    const notes = await store.list();

    assert.deepEqual(
      notes.map((note) => note.title),
      ['Essay'],
    );
  });

  it('ignores files that are not notes', async () => {
    const { dir, store } = await emptyStore();
    await writeFile(path.join(dir, 'desktop.ini'), '', 'utf8');

    assert.deepEqual(await store.list(), []);
  });

  it('refuses an id that points outside the notes folder', async () => {
    const { store } = await emptyStore();

    await assert.rejects(() => store.read('../../secrets.md'));
  });

  it('refuses to write through an id that points outside the notes folder', async () => {
    const { store } = await emptyStore();

    await assert.rejects(() => store.write('../../secrets.md', 'text'));
  });
});
