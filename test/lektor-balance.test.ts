import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LEKTOR_TIMED_OUT, LEKTOR_UNREACHED, type LektorResponse } from '../src/platform/lektor-remote.ts';
import { balanceAfter, balanceFrom, paidIfSlowByDefault } from '../src/ui/lektor/lektor-balance.ts';
import { recorded } from './lektor-api-fixtures.ts';

/* What is left for the paid Lektors, read from OpenRouter's two lookups as they really answer. */

const part = (name: string): { status: number; reply: unknown } => {
  const { status, body } = recorded(name);
  return { status, reply: JSON.parse(body) as unknown };
};
const answer = (credits: unknown, key: unknown, status = 200): LektorResponse => ({ status, reply: { credits, key } });
const capOf = (left: number | null): { status: number; reply: unknown } => ({ status: 200, reply: { data: { limit_remaining: left } } });

describe('reading the balance', () => {
  it("shows the account's own balance when the key's cap leaves more, as recorded", () => {
    // $7,08 in the account against $12,08 left of the key's cap: the account runs out first.
    const reading = balanceFrom(answer(part('openrouter-credits'), part('openrouter-key')));
    assert.equal(reading.kind, 'read');
    assert.equal(reading.kind === 'read' ? reading.dollars.toFixed(2) : '', '7.08');
  });

  it("shows the key's cap when it is the lower", () => {
    assert.deepEqual(balanceFrom(answer({ status: 200, reply: { data: { total_credits: 15, total_usage: 2 } } }, capOf(4.5))), { kind: 'read', dollars: 4.5 });
  });

  it('ignores a key with no cap of its own', () => {
    const reading = balanceFrom(answer({ status: 200, reply: { data: { total_credits: 10, total_usage: 2.53 } } }, capOf(null)));
    assert.equal(reading.kind === 'read' ? reading.dollars.toFixed(2) : reading.kind, '7.47');
  });

  it('falls back on the cap when the account lookup is refused to an ordinary key', () => {
    assert.deepEqual(balanceFrom(answer({ status: 403, reply: { error: { code: 403 } } }, capOf(3.2))), { kind: 'read', dollars: 3.2 });
  });

  it('is unreadable when neither says, which is no trouble with his money', () => {
    assert.deepEqual(balanceFrom(answer({ status: 403, reply: {} }, capOf(null))), { kind: 'unreadable' });
    assert.deepEqual(balanceFrom({ status: LEKTOR_TIMED_OUT, reply: null }), { kind: 'unreadable' });
    assert.deepEqual(balanceFrom(answer({ status: 200, reply: { data: { total_credits: '15' } } }, capOf(null))), { kind: 'unreadable' });
  });

  it('tells a dead key apart from no internet', () => {
    assert.deepEqual(balanceFrom({ status: 401, reply: {} }), { kind: 'dead-key' });
    assert.deepEqual(balanceFrom({ status: LEKTOR_UNREACHED, reply: {} }), { kind: 'offline' });
  });

  it('never reads below nothing', () => {
    assert.deepEqual(balanceFrom(answer({ status: 200, reply: { data: { total_credits: 5, total_usage: 5.2 } } }, capOf(null))), { kind: 'read', dollars: 0 });
  });
});

describe('the tick box to hand a slow free request on', () => {
  it('starts ticked with a paid key and a dollar or more', () => {
    assert.equal(paidIfSlowByDefault(true, 7.47), true);
    assert.equal(paidIfSlowByDefault(true, 1), true);
  });

  it('starts unticked under a dollar, when the balance cannot be read, and without a paid key', () => {
    assert.equal(paidIfSlowByDefault(true, 0.99), false);
    assert.equal(paidIfSlowByDefault(true, null), false);
    assert.equal(paidIfSlowByDefault(false, 7.47), false);
  });
});

describe('keeping the balance right after a run', () => {
  it('takes a paid run’s stated cost off at once', () => {
    assert.equal(balanceAfter(7.47, 0.05)?.toFixed(2), '7.42');
  });

  it('leaves it as it was for a free run, or when it was not known', () => {
    assert.equal(balanceAfter(7.47, null), 7.47);
    assert.equal(balanceAfter(null, 0.05), null);
  });
});
