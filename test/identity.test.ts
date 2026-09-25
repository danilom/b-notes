import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NO_TEXT, type NoText, type NoteHandle } from '../src/notes/note-handle.ts';

/**
 * That a handle and a filename cannot be mistaken for one another.
 *
 * Checked by the compiler rather than at run time, which is why this file
 * mostly does nothing when it runs. `npm run typecheck` is what enforces it,
 * and `@ts-expect-error` is what makes it a test rather than a comment: the
 * directive is itself an error when the line below it stops failing, so the
 * day someone makes these two comparable again, this file says so.
 *
 * It exists because they were comparable, and it cost real behaviour. The
 * count of kept copies was guarded by `asking !== openName()` — a handle
 * against a filename, a number against a string. Always unequal, so the guard
 * always returned early, the count was never taken and the way to his earlier
 * copies stayed greyed out. Nothing in the language objected: both sides could
 * be null, and a shared null is overlap enough for TypeScript.
 *
 * So they no longer share one. Nothing open is `NO_TEXT` for a handle and
 * `null` for a name, and with no value in common the comparison is refused.
 * Not `undefined` for the handle either: that is what a `Map` that missed, a
 * `find` that found nothing and a property never set all look like, and a
 * meaning carried by it cannot be told from any of them.
 */

/*
  Parameters, and not local constants. A `const` is narrowed to whatever it was
  assigned, so the absent halves vanish before the comparison and what is left
  is a plain number against a plain string — which has never compiled, under
  either shape. Written that way this file passed while guarding nothing.
*/
function compare(handle: NoteHandle | NoText, name: string | null): boolean {
  // @ts-expect-error a handle is not a name for a text, and asking whether one
  // equals the other is the mistake this pair of types exists to refuse.
  return handle === name;
}

describe('a handle and a filename', () => {
  it('cannot be compared, which the compiler is what enforces', () => {
    // What the mistake produced, every time, for every real value: the guard
    // written this way always took the wrong branch.
    assert.equal(compare(1 as NoteHandle, 'Pismo'), false);
  });

  it('are both still usable for what they are for', () => {
    // The other half: making them incomparable must not make them unusable.
    const open: NoteHandle | NoText = NO_TEXT;
    const where: string | null = null;

    assert.equal(open === NO_TEXT ? 'nothing open' : 'a text', 'nothing open');
    assert.equal(where ?? 'no file yet', 'no file yet');
  });
});
