import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { diffTexts, mergeCloseChanges, paragraphsOf, separateTidying } from '../src/notes/text-diff.ts';
import {
  type ChangeDecision,
  letterSegmentsOf,
  noDecisions,
  piecesAfter,
  textAfter,
  wordWithLetters,
} from '../src/notes/text-review.ts';

const reviewed = (before: string, after: string) => mergeCloseChanges(separateTidying(diffTexts(before, after)));

const after = (
  before: string,
  proposed: string,
  changes: [number, ChangeDecision][] = [],
  letters: [number, string[]][] = [],
): string => textAfter(piecesAfter(reviewed(before, proposed), { changes: new Map(changes), letters: new Map(letters) }));

const BEFORE = 'Stara kuca je tu.\n\nDrugi  pasus, stari.\n\nKraj.';
const PROPOSED = 'Nova kuća je tu.\n\nDrugi pasus stari.\n\nNovi kraj.';

describe('what he has decided comes to', () => {
  it('is the proposal as it stands, when he has decided nothing', () => {
    assert.equal(textAfter(piecesAfter(reviewed(BEFORE, PROPOSED), noDecisions())), PROPOSED);
  });

  it('puts back only the change he undid', () => {
    assert.equal(after(BEFORE, PROPOSED, [[0, { kind: 'undone' }]]), 'Stara kuća je tu.\n\nDrugi pasus stari.\n\nNovi kraj.');
    assert.equal(after(BEFORE, PROPOSED, [[1, { kind: 'undone' }]]), 'Nova kuća je tu.\n\nDrugi pasus stari.\n\nKraj.');
  });

  it('takes his wording for a change he edited', () => {
    assert.equal(
      after(BEFORE, PROPOSED, [[0, { kind: 'edited', text: 'Moja' }]]),
      'Moja kuća je tu.\n\nDrugi pasus stari.\n\nNovi kraj.',
    );
  });

  it('lets an edit leave nothing where the change was', () => {
    assert.equal(after('Stara kuća.', 'Nova kuća.', [[0, { kind: 'edited', text: '' }]]), ' kuća.');
  });

  it('counts undoing a removal as putting the text back', () => {
    assert.equal(after('Prvi.\n\nStari.\n\nKraj.', 'Prvi.\n\nKraj.', [[0, { kind: 'undone' }]]), 'Prvi.\n\nStari.\n\nKraj.');
  });

  it('counts undoing an addition as taking it away', () => {
    assert.equal(after('Prvi.\n\nKraj.', 'Prvi.\n\nNovi.\n\nKraj.', [[0, { kind: 'undone' }]]), 'Prvi.\n\nKraj.');
  });

  it('counts undoing a paragraph split as joining it back', () => {
    assert.equal(after('Prvi. Drugi.', 'Prvi.\n\nDrugi.', [[0, { kind: 'undone' }]]), 'Prvi. Drugi.');
  });

  it('gives back exactly his text when he undoes every change and every letter', () => {
    const pieces = reviewed('Kuca stara.', 'Kuća nova.');
    assert.equal(textAfter(piecesAfter(pieces, { changes: new Map([[0, { kind: 'undone' }]]), letters: new Map([[0, ['c']]]) })), 'Kuca stara.');
  });

  it('applies a chosen letter to the word it was chosen for', () => {
    assert.equal(after('Sumu i kucu.', 'Šumu i kuću.', [], [[1, ['c']]]), 'Šumu i kucu.');
  });

  it('applies many decisions together without one disturbing another', () => {
    assert.equal(
      after(BEFORE, PROPOSED, [[0, { kind: 'edited', text: 'Moja' }], [1, { kind: 'undone' }]], [[0, ['c']]]),
      'Moja kuca je tu.\n\nDrugi pasus stari.\n\nKraj.',
    );
  });

  it('keeps the line endings he has, whatever he decides', () => {
    assert.equal(after('Stari red\r\nDrugi', 'Novi red\nDrugi', [[0, { kind: 'undone' }]]), 'Stari red\r\nDrugi');
  });
});

describe('the letters offered for a corrected word', () => {
  it('offers what was there, and the rest of its family', () => {
    assert.deepEqual(letterSegmentsOf('kuca', 'kuća'), [
      { kind: 'fixed', text: 'ku' },
      { kind: 'slot', proposed: 'ć', choices: ['c', 'č', 'ć'] },
      { kind: 'fixed', text: 'a' },
    ]);
  });

  it('offers dj as he typed it for đ', () => {
    assert.deepEqual(letterSegmentsOf('ledja', 'leđa').at(1), { kind: 'slot', proposed: 'đ', choices: ['dj', 'd', 'đ'] });
  });

  it('is not confused by a letter that went away earlier in the word', () => {
    const slot = letterSegmentsOf('kxuca', 'kuća').find((segment) => segment.kind === 'slot');

    assert.deepEqual(slot, { kind: 'slot', proposed: 'ć', choices: ['c', 'č', 'ć'] });
  });

  it('keeps a capital a capital', () => {
    assert.deepEqual(letterSegmentsOf('Sumu', 'Šumu').at(0), { kind: 'slot', proposed: 'Š', choices: ['S', 'Š'] });
    assert.deepEqual(letterSegmentsOf('Djed', 'Đed').at(0), { kind: 'slot', proposed: 'Đ', choices: ['Dj', 'D', 'Đ'] });
  });

  it('offers each corrected letter of a word by itself', () => {
    const slots = letterSegmentsOf('sisaju', 'šišaju').filter((segment) => segment.kind === 'slot');

    assert.equal(slots.length, 2);
  });

  it('offers nothing for what has no alternatives, such as a comma', () => {
    assert.deepEqual(letterSegmentsOf('', ','), [{ kind: 'fixed', text: ',' }]);
  });

  it('builds the word from what was chosen, and what was proposed where nothing was', () => {
    const segments = letterSegmentsOf('sisaju', 'šišaju');

    assert.equal(wordWithLetters(segments, []), 'šišaju');
    assert.equal(wordWithLetters(segments, ['s']), 'sišaju');
    assert.equal(wordWithLetters(segments, ['š', 's']), 'šisaju');
  });
});

describe('drawing what he has decided', () => {
  const drawn = (before: string, proposed: string, changes: [number, ChangeDecision][]) =>
    paragraphsOf(piecesAfter(reviewed(before, proposed), { changes: new Map(changes), letters: new Map() }), { showTidied: true });

  it('draws what he undid as plain text, still marked as his decision', () => {
    const [paragraph] = drawn('Stara kuća.', 'Nova kuća.', [[0, { kind: 'undone' }]]);

    assert.deepEqual(paragraph?.parts.at(0), { kind: 'undone', text: 'Stara', opensChange: true });
    assert.equal(paragraph?.parts.some((part) => part.kind === 'removed' || part.kind === 'added'), false);
    assert.equal(paragraph?.changed, true);
  });

  it('keeps a part for an addition he undid, empty as it is, so that it can be found again', () => {
    const [paragraph] = drawn('Prvi kraj.', 'Prvi novi kraj.', [[0, { kind: 'undone' }]]);

    assert.deepEqual(paragraph?.parts.find((part) => part.kind === 'undone'), { kind: 'undone', text: '', opensChange: true });
  });

  it('draws what he edited as a change like any other', () => {
    const [paragraph] = drawn('Stara kuća.', 'Nova kuća.', [[0, { kind: 'edited', text: 'Moja' }]]);

    assert.deepEqual(paragraph?.parts.filter((part) => part.kind !== 'same').map((part) => [part.kind, part.text]), [
      ['removed', 'Stara'],
      ['added', 'Moja'],
    ]);
  });

  it('keeps a word whose letter he put back as a part, so that it can be changed again', () => {
    const pieces = piecesAfter(reviewed('Tu je sumu.', 'Tu je šumu.'), { changes: new Map(), letters: new Map([[0, ['s']]]) });
    const part = paragraphsOf(pieces, { showTidied: true })[0]?.parts.find((one) => one.kind === 'tidied');

    assert.deepEqual(part, { kind: 'tidied', text: 'sumu', was: 'sumu', proposed: 'šumu', tidyAt: 0, opensChange: false });
  });

  it('numbers tidied words in reading order', () => {
    const parts = paragraphsOf(reviewed('Sumu i kucu.', 'Šumu i kuću.'), { showTidied: true })[0]?.parts ?? [];

    assert.deepEqual(parts.filter((part) => part.kind === 'tidied').map((part) => part.tidyAt), [0, 1]);
  });
});
