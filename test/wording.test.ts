import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { describeWhen } from '../src/language/wording.ts';

/** A fixed afternoon, so "today" and "yesterday" don't depend on when tests run. */
const NOW = new Date(2026, 8, 19, 14, 30).getTime();

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const ago = (amount: number) => describeWhen(NOW - amount, 'sr', NOW);

describe('describing when a text was last touched', () => {
  it('says just now for anything inside the last minute', () => {
    assert.equal(ago(0), 'upravo sad');
    assert.equal(ago(59000), 'upravo sad');
  });

  it('counts minutes for the first hour', () => {
    assert.equal(ago(5 * MINUTE), 'pre 5 minuta');
    assert.equal(ago(59 * MINUTE), 'pre 59 minuta');
  });

  it('counts hours for the rest of today', () => {
    assert.equal(ago(2 * HOUR), 'pre 2 sata');
    assert.equal(ago(14 * HOUR), 'pre 14 sati');
  });

  it('says yesterday rather than counting back past midnight', () => {
    // 20 hours before half past two is yesterday evening, not "pre 20 sati".
    assert.equal(ago(20 * HOUR), 'juče');
  });

  it('gives the day and month once it is older than yesterday', () => {
    assert.equal(ago(5 * DAY), '14. septembra');
  });

  it('drops to the year alone once the day and month could mean either year', () => {
    assert.equal(ago(329 * DAY), '25. oktobra');
    assert.equal(ago(331 * DAY), '2025');
    assert.equal(ago(2000 * DAY), '2021');
  });

  it('gets the three Serbian plural forms right, which he would notice', () => {
    assert.equal(ago(1 * MINUTE), 'pre 1 minut');
    assert.equal(ago(11 * MINUTE), 'pre 11 minuta');
    assert.equal(ago(21 * MINUTE), 'pre 21 minut');
    assert.equal(ago(3 * HOUR), 'pre 3 sata');
    assert.equal(ago(5 * HOUR), 'pre 5 sati');
  });

  it('uses the same ladder in English', () => {
    const english = (amount: number) => describeWhen(NOW - amount, 'en', NOW);
    assert.equal(english(0), 'just now');
    assert.equal(english(5 * MINUTE), '5 minutes ago');
    assert.equal(english(1 * MINUTE), '1 minute ago');
    assert.equal(english(20 * HOUR), 'yesterday');
    assert.equal(english(5 * DAY), '14 September');
    assert.equal(english(331 * DAY), '2025');
  });
});
