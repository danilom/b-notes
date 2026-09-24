import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FileMissing,
  FolderMissing,
  absenceIn,
  absenceReply,
} from '../src/platform/file-system.ts';

/**
 * An absence has to survive being carried between two processes.
 *
 * Electron keeps the words of a rejection and throws the class away, and the
 * store tells an absence from a failure with `instanceof` — so the whole
 * "this is ordinary" half of the store answered false in the app he installs
 * and true in the browser it is developed in. Nothing but this can catch that:
 * every other test runs in one process, where the class is simply itself.
 */
describe('an absence crossing between processes', () => {
  it('comes back as the same absence, about the same folder', () => {
    const reply = absenceReply(new FolderMissing('C:/Users/x/Dokumenti/Tekstovi/Verzije/Pismo'));
    assert.notEqual(reply, null);

    const back = absenceIn(reply);

    assert.ok(back instanceof FolderMissing);
    assert.equal(back.folder, 'C:/Users/x/Dokumenti/Tekstovi/Verzije/Pismo');
  });

  it('comes back as the same absence, about the same file', () => {
    const back = absenceIn(absenceReply(new FileMissing('C:/x/Pismo.txt')));

    assert.ok(back instanceof FileMissing);
    assert.equal(back.path, 'C:/x/Pismo.txt');
  });

  it('survives the copy Electron makes of everything it carries', () => {
    // It crosses as data now rather than as the words of a rejection, and
    // what crosses is a structured clone. Nothing of it may depend on the
    // object being the very one that was made.
    const reply = absenceReply(new FolderMissing('C:/x/Verzije/Pismo'));

    const back = absenceIn(JSON.parse(JSON.stringify(reply)) as unknown);

    assert.ok(back instanceof FolderMissing);
    assert.equal(back.folder, 'C:/x/Verzije/Pismo');
  });

  it('keeps a path that has the separator in it', () => {
    // The kind and the path are joined by a bar, and a Windows path can hold
    // one. Splitting on the first is the whole of the rule.
    const back = absenceIn(absenceReply(new FileMissing('C:/x/odd|name.txt')));

    assert.ok(back instanceof FileMissing);
    assert.equal(back.path, 'C:/x/odd|name.txt');
  });

  it('refuses to flatten anything that is not an absence', () => {
    // A disk that has gone must never be made to look like an empty folder.
    assert.equal(absenceReply(new Error('EPERM: operation not permitted')), null);
    assert.equal(absenceReply('a string'), null);
    assert.equal(absenceReply(null), null);
  });

  it('finds no absence in an ordinary answer', () => {
    // Everything the bridge really answers with, so that none of it can be
    // mistaken for a folder that was never there.
    assert.equal(absenceIn([{ path: 'C:/x/Pismo.txt', updatedAt: 1, bytes: 9 }]), null);
    assert.equal(absenceIn('the text of his letter'), null);
    assert.equal(absenceIn(true), null);
    assert.equal(absenceIn(undefined), null);
    assert.equal(absenceIn(null), null);
    assert.equal(absenceIn({ writing: 'C:/x', app: 'C:/y', logs: 'C:/z' }), null);
  });
});
