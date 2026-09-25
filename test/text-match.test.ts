import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { foundPanelFor, matchesIn } from '../src/ui/parts/text-match.ts';

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

describe('the panel counting what a search found', () => {
  const some = (howMany: number) =>
    Array.from({ length: howMany }, (_, at) => ({ start: at, end: at + 1 }));

  it('is not there when the search found nothing', () => {
    assert.equal(foundPanelFor([], 0, 'sr').shown, false);
  });

  it('says so in words when there is only one, rather than counting to it', () => {
    // "1 od 1" is a sum. What he wants to know is that there is no more looking.
    assert.equal(foundPanelFor(some(1), 0, 'sr').label, 'samo jednom');
  });

  it('leaves both arrows quiet when there is nowhere to step', () => {
    const panel = foundPanelFor(some(1), 0, 'sr');

    assert.deepEqual([panel.canGoBack, panel.canGoOn], [false, false]);
  });

  it('counts from one, where he counts from', () => {
    assert.equal(foundPanelFor(some(81), 0, 'sr').label, '1 od 81');
  });

  it('says where he is among them', () => {
    assert.equal(foundPanelFor(some(81), 40, 'sr').label, '41 od 81');
  });

  it('lets him step on once there is more than one', () => {
    const panel = foundPanelFor(some(2), 0, 'sr');

    assert.deepEqual([panel.canGoBack, panel.canGoOn], [false, true]);
  });

  it('stops at the last one rather than starting over', () => {
    // It used to wrap. A list that silently begins again leaves him unable to
    // tell whether he has seen them all or lost his place.
    const panel = foundPanelFor(some(9), 8, 'sr');

    assert.deepEqual([panel.canGoBack, panel.canGoOn], [true, false]);
  });

  it('lets him go both ways in the middle', () => {
    const panel = foundPanelFor(some(9), 4, 'sr');

    assert.deepEqual([panel.canGoBack, panel.canGoOn], [true, true]);
  });

  it('counts the same way in English', () => {
    assert.equal(foundPanelFor(some(9), 2, 'en').label, '3 of 9');
  });
});
