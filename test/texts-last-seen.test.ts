import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { looksLikeLoss } from '../src/ui/texts-last-seen.ts';

describe('telling an empty list from his writing having gone', () => {
  const here = 'Tekstovi';

  it('calls it a loss when texts were here and now there are none', () => {
    // The whole point. Without this he is greeted with "Jos nema tekstova"
    // while six hundred essays are missing.
    assert.equal(looksLikeLoss({ folder: here, texts: 592 }, { folder: here, texts: 0 }), true);
  });

  it('says nothing on a first run, having nothing to compare against', () => {
    assert.equal(looksLikeLoss(null, { folder: here, texts: 0 }), false);
  });

  it('says nothing when he has simply never written anything', () => {
    assert.equal(looksLikeLoss({ folder: here, texts: 0 }, { folder: here, texts: 0 }), false);
  });

  it('says nothing when the app has just been pointed somewhere else', () => {
    // A different folder is a different place, not a disappearance.
    assert.equal(looksLikeLoss({ folder: here, texts: 592 }, { folder: 'Drugde', texts: 0 }), false);
  });

  it('says nothing while even one text is still there', () => {
    assert.equal(looksLikeLoss({ folder: here, texts: 592 }, { folder: here, texts: 1 }), false);
  });

  it('counts his deleted ones as still there, since they are', () => {
    // The caller adds them in: a man who has genuinely thrown everything away
    // has not lost it, and must not be told he has.
    assert.equal(looksLikeLoss({ folder: here, texts: 592 }, { folder: here, texts: 95 }), false);
  });
});
