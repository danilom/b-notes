import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { costOfReply, spentLine } from '../design/lektor-spending.ts';

describe('costOfReply', () => {
  it('prices a typical correction at Opus rates', () => {
    const cost = costOfReply({ inputTokens: 8_000, outputTokens: 11_000 });
    assert.ok(Math.abs(cost - 0.252) < 1e-9);
  });
});

describe('spentLine', () => {
  it('writes the amount with a decimal comma and says it is approximate', () => {
    assert.equal(spentLine(9.374), 'potrošeno dosad oko 9,37 $');
  });
});
