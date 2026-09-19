import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { matchesIn } from '../src/ui/text-match.ts';

const found = (text: string, query: string) =>
  matchesIn(text, query).map(({ start, end }) => text.slice(start, end));

describe('finding the search inside his text', () => {
  it('finds nothing at all when he has not searched for anything', () => {
    assert.deepEqual(matchesIn('Sjećam se tog ljeta.', ''), []);
    assert.deepEqual(matchesIn('Sjećam se tog ljeta.', '   '), []);
  });

  it('finds every occurrence, not only the first', () => {
    assert.deepEqual(matchesIn('zima, zima, zima', 'zima').length, 3);
  });

  it('ignores case, the way the list does', () => {
    assert.deepEqual(found('Zima i ZIMA i zima', 'zima'), ['Zima', 'ZIMA', 'zima']);
  });

  it('reports where each one is, not just that there was one', () => {
    assert.deepEqual(matchesIn('--zima--', 'zima'), [{ start: 2, end: 6 }]);
  });

  it('never overlaps two marks on the same letters', () => {
    // "aa" appears twice in "aaaa", not three times: the second starts after
    // the first ends, or the marks would be laid on top of each other.
    assert.deepEqual(matchesIn('aaaa', 'aa'), [
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });

  it('ignores the spaces around what he typed', () => {
    assert.deepEqual(found('tog ljeta', '  ljeta '), ['ljeta']);
  });

  it('stops marking long before a whole essay is painted', () => {
    // One letter against 145KB finds tens of thousands; every one would be an
    // element behind his writing, and a page marked everywhere says nothing.
    const many = matchesIn('a'.repeat(50_000), 'a');
    assert.equal(many.length, 500);
    assert.deepEqual(many.at(-1), { start: 499, end: 500 });
  });
});
