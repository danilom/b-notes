import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isSmallEdit, wordsChanged } from '../src/ui/lektor/lektor-small-edit.ts';

const ESSAY = 'Most je star, a star je i onaj koji ga gleda. Niko ne pita kuda vodi rijeka.\n\nDjed je govorio bez tuge, kao sto se kaze koliko je sati, pa je zatim cutao do veceri.';

describe('wordsChanged', () => {
  it('counts one word replaced by another once', () => {
    assert.equal(wordsChanged(ESSAY, ESSAY.replace('star,', 'stari,')), 1);
  });

  it('counts each word added or taken out', () => {
    assert.equal(wordsChanged(ESSAY, ESSAY.replace('Niko ne pita', 'Niko')), 2);
    assert.equal(wordsChanged(ESSAY, `${ESSAY} Dodao sam tri.`), 3);
  });

  it('counts a moved paragraph, which a count of the words alone would see as no change', () => {
    const [first = '', second = ''] = ESSAY.split('\n\n');
    assert.ok(wordsChanged(ESSAY, `${second}\n\n${first}`) > 10);
  });

  it('counts nothing for a changed comma', () => {
    assert.equal(wordsChanged(ESSAY, ESSAY.replace('star,', 'star')), 0);
  });
});

describe('isSmallEdit', () => {
  const adding = (count: number): string => `${ESSAY} ${Array.from({ length: count }, (_, at) => `rec${at}`).join(' ')}`;

  it('takes ten changed words as small, and eleven as not', () => {
    assert.equal(isSmallEdit(ESSAY, adding(10)), true);
    assert.equal(isSmallEdit(ESSAY, adding(11)), false);
  });

  it('takes a changed comma as an edit', () => {
    assert.equal(isSmallEdit(ESSAY, ESSAY.replace('star,', 'star')), true);
  });

  it('does not take an unchanged text as an edit, nor one that differs only in blank lines at its very end', () => {
    assert.equal(isSmallEdit(ESSAY, ESSAY), false);
    assert.equal(isSmallEdit(ESSAY, `${ESSAY}\n\n`), false);
  });
});
