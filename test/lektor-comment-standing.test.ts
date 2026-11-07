import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type CommentSitting, SITTING_MS, standingOf, wordsChanged, wordsForBigChange } from '../src/ui/lektor/lektor-comment-standing.ts';

const PARAGRAPH = 'Most je star, a star je i onaj koji ga gleda. Niko ne pita kuda vodi rijeka, niti ko je prije njih tuda prosao.';
const words = (count: number, from = 0): string => Array.from({ length: count }, (_, at) => `rec${from + at}`).join(' ');
/** An essay of about four hundred words. */
const ESSAY = Array.from({ length: 18 }, () => PARAGRAPH).join('\n\n');

const sitting = (text: string, change: Partial<CommentSitting> = {}): CommentSitting => ({
  readText: ESSAY,
  text,
  isFromThisRun: true,
  hasTakenCorrections: false,
  readAt: 1_000,
  now: 2_000,
  ...change,
});

describe('wordsChanged', () => {
  it('counts one word replaced by another once', () => {
    assert.equal(wordsChanged(PARAGRAPH, PARAGRAPH.replace('star,', 'stari,')), 1);
  });

  it('counts a moved paragraph, which a count of the words alone would see as no change', () => {
    const [first = '', second = ''] = [PARAGRAPH, words(30)];
    assert.ok(wordsChanged(`${first}\n\n${second}`, `${second}\n\n${first}`) >= 22);
  });
});

describe('wordsForBigChange', () => {
  it('is fifty words for an essay, and a fifth of a short text', () => {
    assert.equal(wordsForBigChange(ESSAY), 50);
    assert.equal(wordsForBigChange(words(100)), 20);
    assert.equal(wordsForBigChange(words(20)), 4);
  });
});

describe('standingOf', () => {
  it('takes a small change as still current, so there is nothing to say', () => {
    assert.deepEqual(standingOf(sitting(`${ESSAY} ${words(49)}`)), { kind: 'current' });
  });

  it('tells how much has changed after a big change in the same sitting', () => {
    assert.deepEqual(standingOf(sitting(`${ESSAY} ${words(50)}`)), { kind: 'changed', wordsChanged: 50 });
  });

  it('takes a big change as outdated once the app has been closed since', () => {
    assert.deepEqual(standingOf(sitting(`${ESSAY} ${words(50)}`, { isFromThisRun: false })), { kind: 'outdated', wordsChanged: 50 });
  });

  it('takes a big change as outdated once he has put corrections in', () => {
    assert.deepEqual(standingOf(sitting(`${ESSAY} ${words(50)}`, { hasTakenCorrections: true })), { kind: 'outdated', wordsChanged: 50 });
  });

  it('takes a big change as outdated two hours on, and not a moment before', () => {
    assert.equal(standingOf(sitting(`${ESSAY} ${words(50)}`, { now: 1_000 + SITTING_MS - 1 })).kind, 'changed');
    assert.equal(standingOf(sitting(`${ESSAY} ${words(50)}`, { now: 1_000 + SITTING_MS })).kind, 'outdated');
  });

  it('never takes a small change as outdated, however long ago and whatever happened since', () => {
    const later = { isFromThisRun: false, hasTakenCorrections: true, now: 1_000 + 10 * SITTING_MS };
    assert.deepEqual(standingOf(sitting(`${ESSAY} ${words(3)}`, later)), { kind: 'current' });
  });

  it('takes the same text as current, blank lines at its very end included', () => {
    assert.deepEqual(standingOf(sitting(`${ESSAY}\n\n`, { isFromThisRun: false })), { kind: 'current' });
  });
});
