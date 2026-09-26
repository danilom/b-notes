import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { writingStartsAt } from '../src/notes/note-title.ts';

/**
 * Where a caret may be dropped without the app editing the name of the file.
 */
describe('where his writing starts, as against where his text starts', () => {
  it('starts it below the line the text is named after', () => {
    assert.equal(writingStartsAt('Naslov\nPrvi red.'), 7);
  });

  it('keeps a blank line between title and body on the writing side of the cut', () => {
    const text = 'Naslov\n\nPrvi red.';
    assert.equal(writingStartsAt(text), 7);
    assert.equal(text.slice(writingStartsAt(text)), '\nPrvi red.');
  });

  it('answers the very start for one unbroken block, which is all name', () => {
    assert.equal(writingStartsAt('Sve u jednom pasusu, bez ijednog preloma.'), 0);
  });

  it('answers the very start for a text with nothing in it', () => {
    assert.equal(writingStartsAt(''), 0);
  });
});
