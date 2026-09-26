import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_ADVANCED, advancedFrom } from '../src/ui/settings/advanced-settings.ts';

/**
 * The knobs that are not his.
 *
 * Meant to be changed by hand in a file, which makes a bad value the expected
 * input rather than the surprising one: a missing comma, a word where a number
 * should be, a minus sign. None of it may leave the app in a state he would
 * have to describe over the telephone.
 */
describe('reading the advanced settings', () => {
  it('takes a number it can use', () => {
    assert.deepEqual(advancedFrom({ ctrlCardAfterMs: 250 }), { ctrlCardAfterMs: 250 });
  });

  it('falls back when the file says something that is not a number', () => {
    assert.deepEqual(advancedFrom({ ctrlCardAfterMs: 'brzo' }), DEFAULT_ADVANCED);
    assert.deepEqual(advancedFrom({ ctrlCardAfterMs: null }), DEFAULT_ADVANCED);
  });

  it('refuses a wait that is not a wait', () => {
    // Negative, or so long the card would never come: either is a mistake, and
    // living with the default beats behaving in a way nobody can account for.
    assert.deepEqual(advancedFrom({ ctrlCardAfterMs: -1 }), DEFAULT_ADVANCED);
    assert.deepEqual(advancedFrom({ ctrlCardAfterMs: 60_000 }), DEFAULT_ADVANCED);
    assert.deepEqual(advancedFrom({ ctrlCardAfterMs: Number.NaN }), DEFAULT_ADVANCED);
  });

  it('survives a file that is not what it should be at all', () => {
    assert.deepEqual(advancedFrom(null), DEFAULT_ADVANCED);
    assert.deepEqual(advancedFrom('a string'), DEFAULT_ADVANCED);
    assert.deepEqual(advancedFrom({}), DEFAULT_ADVANCED);
  });

  it('lets it be switched off outright', () => {
    // Zero is a real answer: show it the moment he touches the key. Not the
    // same as a mistake, so it is not corrected into one.
    assert.deepEqual(advancedFrom({ ctrlCardAfterMs: 0 }), { ctrlCardAfterMs: 0 });
  });
});
