import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { textToCopy } from '../src/ui/copied-text.ts';

/**
 * The line under a copied text is read days later by somebody who cannot ask
 * what it meant, and every way it can be wrong still looks like a line that is
 * right: a date a day out is a date, a count that includes the line itself is a
 * count. None of it is visible from inside the app.
 */
describe('the line under a text he has copied', () => {
  const MARCH = new Date(2022, 2, 2, 14, 30).getTime();

  it('says when it last changed and how long it is', () => {
    const copied = textToCopy('Jedan dva tri.', MARCH, 'sr');
    assert.ok(copied.endsWith('Poslednja izmena: 2022-03-02 · 3 reči'), copied);
  });

  it('keeps his own text first and whole', () => {
    const copied = textToCopy('Prvi red.\n\nDrugi red.', MARCH, 'sr');
    assert.ok(copied.startsWith('Prvi red.\n\nDrugi red.'), copied);
  });

  /*
    Both ends of the day, because which one breaks depends on which side of
    UTC the clock is set to. `toISOString` reads midnight back as the day
    before east of Greenwich and late evening as the day after west of it, so
    one case alone passes on half the machines that could run this.
  */
  it('dates a text by his own day, not by the one in Greenwich', () => {
    const justAfterMidnight = new Date(2022, 2, 2, 0, 30).getTime();
    const lateEvening = new Date(2022, 2, 2, 23, 30).getTime();

    assert.ok(textToCopy('reč', justAfterMidnight, 'sr').includes('2022-03-02'));
    assert.ok(textToCopy('reč', lateEvening, 'sr').includes('2022-03-02'));
  });

  it('counts his words and not the line it adds to them', () => {
    const copied = textToCopy('Jedan dva tri.', MARCH, 'sr');
    assert.ok(copied.includes('· 3 reči'), copied);
  });

  it('leaves the date out of a text that has never been saved', () => {
    const copied = textToCopy('Jedan dva tri.', null, 'sr');
    assert.ok(copied.endsWith('3 reči'), copied);
    assert.ok(!copied.includes('Poslednja izmena'), copied);
  });

  it('separates the line by the same gap however he ended his text', () => {
    const plain = textToCopy('Kraj.', MARCH, 'sr');
    const trailing = textToCopy('Kraj.\n\n\n\n   \n', MARCH, 'sr');

    assert.equal(trailing, plain);
    assert.ok(plain.startsWith('Kraj.\n\n\nPoslednja izmena'), JSON.stringify(plain));
  });
});
