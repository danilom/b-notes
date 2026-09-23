import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FileMissing,
  FolderMissing,
  absenceFrom,
  markAbsence,
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
    const marked = markAbsence(new FolderMissing('C:/Users/x/Dokumenti/Tekstovi/Verzije/Pismo'));
    assert.notEqual(marked, null);

    const back = absenceFrom(marked ?? '');

    assert.ok(back instanceof FolderMissing);
    assert.equal(back.folder, 'C:/Users/x/Dokumenti/Tekstovi/Verzije/Pismo');
  });

  it('comes back as the same absence, about the same file', () => {
    const back = absenceFrom(markAbsence(new FileMissing('C:/x/Pismo.txt')) ?? '');

    assert.ok(back instanceof FileMissing);
    assert.equal(back.path, 'C:/x/Pismo.txt');
  });

  it('is found however much is said in front of it', () => {
    // What actually arrives is "Error invoking remote method 'files:list': …",
    // so the marker is never at the start of the message.
    const marked = markAbsence(new FolderMissing('C:/x/Verzije/Pismo')) ?? '';

    const back = absenceFrom(`Error invoking remote method 'files:list': ${marked}`);

    assert.ok(back instanceof FolderMissing);
    assert.equal(back.folder, 'C:/x/Verzije/Pismo');
  });

  it('refuses to flatten anything that is not an absence', () => {
    // A disk that has gone must never be made to look like an empty folder.
    assert.equal(markAbsence(new Error('EPERM: operation not permitted')), null);
    assert.equal(markAbsence('a string'), null);
    assert.equal(markAbsence(null), null);
  });

  it('finds no absence in an ordinary failure', () => {
    assert.equal(absenceFrom('Error invoking remote method: EPERM'), null);
    assert.equal(absenceFrom(''), null);
  });
});
