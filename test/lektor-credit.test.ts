import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { costOfReply, creditAfter, creditLine, creditTyped } from '../design/lektor-credit.ts';

describe('costOfReply', () => {
  it('prices a typical correction at Opus rates', () => {
    const cost = costOfReply({ inputTokens: 8_000, outputTokens: 11_000 });
    assert.ok(Math.abs(cost - 0.252) < 1e-9);
  });
});

describe('creditAfter', () => {
  it('takes the cost off what was left', () => {
    assert.ok(Math.abs(creditAfter(10, 0.25) - 9.75) < 1e-9);
  });

  it('stops at nothing rather than showing a debt', () => {
    assert.equal(creditAfter(0.1, 0.25), 0);
  });
});

describe('creditLine', () => {
  it('writes the amount with a decimal comma and says it is approximate', () => {
    assert.equal(creditLine(9.374), 'preostalo oko 9,37 $');
  });
});

describe('creditTyped', () => {
  it('takes a decimal comma or point, with or without the dollar sign', () => {
    assert.equal(creditTyped('10,50'), 10.5);
    assert.equal(creditTyped('10.50'), 10.5);
    assert.equal(creditTyped(' 10 $ '), 10);
  });

  it('returns null for an empty box, for words and for a negative amount', () => {
    assert.equal(creditTyped('  '), null);
    assert.equal(creditTyped('deset'), null);
    assert.equal(creditTyped('-5'), null);
  });
});
