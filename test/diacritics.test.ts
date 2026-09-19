import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toSearchable } from '../src/language/diacritics.ts';

describe('reducing his text to what a search compares', () => {
  it('folds the five letters Serbian Latin adds', () => {
    assert.equal(toSearchable('šđčćž'), 'sdccz');
    assert.equal(toSearchable('ŠĐČĆŽ'), 'sdccz');
  });

  it('leaves a word alone when it never had any', () => {
    assert.equal(toSearchable('Macka je na krovu'), 'macka je na krovu');
  });

  it('brings every spelling of one word to the same place', () => {
    const folded = ['čičak', 'cičak', 'čicak', 'cicak'].map(toSearchable);
    assert.deepEqual(new Set(folded), new Set(['cicak']));
  });

  it('never changes the length, or the marks would land on the wrong letters', () => {
    // The offsets of what is found are used to mark his writing, so one
    // character has to fold to exactly one character.
    for (const word of ['šećer', 'Đurđevdan', 'ČIČAK', 'čovjek i žena', 'mačka']) {
      assert.equal(toSearchable(word).length, word.length, word);
    }
  });

  it('is what he actually types, not a rule about how it should be spelt', () => {
    // `đ` has a stroke rather than an accent, so it does not decompose the way
    // the others do — it is why this is a table and not a normalize() call.
    assert.equal(toSearchable('đ'), 'd');
    assert.equal(toSearchable('đ').length, 1);
  });
});
