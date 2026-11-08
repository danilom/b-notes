import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { diffTexts, mergeCloseChanges, paragraphsOf, separateTidying } from '../src/notes/text-diff.ts';
import {
  type ChangeChoice,
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
  changes: [number, ChangeChoice][] = [],
  letters: [number, string[]][] = [],
): string => textAfter(piecesAfter(reviewed(before, proposed), { changes: new Map(changes), letters: new Map(letters) }));

const BEFORE = 'Stara kuca je tu.\n\nDrugi  pasus, stari.\n\nKraj.';
const PROPOSED = 'Nova kuća je tu.\n\nDrugi pasus stari.\n\nNovi kraj.';

describe('what he has decided comes to', () => {
  it('is the proposal as it stands, when he has decided nothing', () => {
    assert.equal(textAfter(piecesAfter(reviewed(BEFORE, PROPOSED), noDecisions())), PROPOSED);
  });

  it('puts back only the change he undid', () => {
    assert.equal(after(BEFORE, PROPOSED, [[0, { chosen: 'old' }]]), 'Stara kuća je tu.\n\nDrugi pasus stari.\n\nNovi kraj.');
    assert.equal(after(BEFORE, PROPOSED, [[1, { chosen: 'old' }]]), 'Nova kuća je tu.\n\nDrugi pasus stari.\n\nKraj.');
  });

  it('takes his wording for a change he edited', () => {
    assert.equal(
      after(BEFORE, PROPOSED, [[0, { chosen: 'own', own: 'Moja' }]]),
      'Moja kuća je tu.\n\nDrugi pasus stari.\n\nNovi kraj.',
    );
  });

  it('lets an edit leave nothing where the change was', () => {
    assert.equal(after('Stara kuća.', 'Nova kuća.', [[0, { chosen: 'own', own: '' }]]), ' kuća.');
  });

  it('counts undoing a removal as putting the text back', () => {
    assert.equal(after('Prvi.\n\nStari.\n\nKraj.', 'Prvi.\n\nKraj.', [[0, { chosen: 'old' }]]), 'Prvi.\n\nStari.\n\nKraj.');
  });

  it('counts undoing an addition as taking it away', () => {
    assert.equal(after('Prvi.\n\nKraj.', 'Prvi.\n\nNovi.\n\nKraj.', [[0, { chosen: 'old' }]]), 'Prvi.\n\nKraj.');
  });

  it('counts undoing a paragraph split as joining it back', () => {
    assert.equal(after('Prvi. Drugi.', 'Prvi.\n\nDrugi.', [[0, { chosen: 'old' }]]), 'Prvi. Drugi.');
  });

  it('gives back exactly his text when he undoes every change and every letter', () => {
    const pieces = reviewed('Kuca stara.', 'Kuća nova.');
    assert.equal(textAfter(piecesAfter(pieces, { changes: new Map([[0, { chosen: 'old' }]]), letters: new Map([[0, ['c']]]) })), 'Kuca stara.');
  });

  it('applies a chosen letter to the word it was chosen for', () => {
    assert.equal(after('Sumu i kucu.', 'Šumu i kuću.', [], [[1, ['c']]]), 'Šumu i kucu.');
  });

  it('applies many decisions together without one disturbing another', () => {
    assert.equal(
      after(BEFORE, PROPOSED, [[0, { chosen: 'own', own: 'Moja' }], [1, { chosen: 'old' }]], [[0, ['c']]]),
      'Moja kuca je tu.\n\nDrugi pasus stari.\n\nKraj.',
    );
  });

  it('keeps the line endings he has, whatever he decides', () => {
    assert.equal(after('Stari red\r\nDrugi', 'Novi red\nDrugi', [[0, { chosen: 'old' }]]), 'Stari red\r\nDrugi');
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

  it('offers letters side by side each by itself, not as one', () => {
    assert.deepEqual(letterSegmentsOf('sc', 'šć'), [
      { kind: 'slot', proposed: 'š', choices: ['s', 'š'] },
      { kind: 'slot', proposed: 'ć', choices: ['c', 'č', 'ć'] },
    ]);
  });

  it('offers nothing for what has no alternatives, such as a comma, but knows it was put there', () => {
    assert.deepEqual(letterSegmentsOf('', ','), [{ kind: 'fixed', text: ',', put: true }]);
  });

  it('keeps what was put there apart from what stood there all along', () => {
    assert.deepEqual(letterSegmentsOf('ab', 'a,b'), [
      { kind: 'fixed', text: 'a' },
      { kind: 'fixed', text: ',', put: true },
      { kind: 'fixed', text: 'b' },
    ]);
  });

  it('builds the word from what was chosen, and what was proposed where nothing was', () => {
    const segments = letterSegmentsOf('sisaju', 'šišaju');

    assert.equal(wordWithLetters(segments, []), 'šišaju');
    assert.equal(wordWithLetters(segments, ['s']), 'sišaju');
    assert.equal(wordWithLetters(segments, ['š', 's']), 'šisaju');
  });
});

describe('drawing a change open, with every wording it has', () => {
  const openParts = (choice: ChangeChoice) => {
    const pieces = piecesAfter(reviewed('Stara kuća.', 'Nova kuća.'), { changes: new Map([[0, choice]]), letters: new Map() });
    return paragraphsOf(pieces)[0]?.parts.filter((part) => part.kind !== 'same');
  };

  it('strikes out the old text and not the proposal, when nothing else is chosen', () => {
    assert.deepEqual(paragraphsOf(reviewed('Stara kuća.', 'Nova kuća.'))[0]?.parts.filter((part) => part.kind !== 'same'), [
      { kind: 'removed', text: 'Stara', opensChange: true, struck: true },
      { kind: 'added', text: 'Nova', opensChange: false },
    ]);
  });

  it('shows his wording after the other two, and strikes out all but the chosen one', () => {
    assert.deepEqual(openParts({ chosen: 'old', own: 'Moja' }), [
      { kind: 'removed', text: 'Stara', opensChange: true },
      { kind: 'added', text: 'Nova', opensChange: false, struck: true },
      { kind: 'own', text: 'Moja', opensChange: false, struck: true },
    ]);
  });

  it('keeps his wording when he picks another, while putting in the one he picked', () => {
    assert.equal(after('Stara kuća.', 'Nova kuća.', [[0, { chosen: 'proposed', own: 'Moja' }]]), 'Nova kuća.');
    assert.equal(openParts({ chosen: 'proposed', own: 'Moja' })?.at(-1)?.text, 'Moja');
  });

  it('leaves out a wording that is nothing, where the others struck out say as much', () => {
    const pieces = piecesAfter(reviewed('Prvi kraj.', 'Prvi novi kraj.'), { changes: new Map([[0, { chosen: 'old' }]]), letters: new Map() });
    const parts = paragraphsOf(pieces)[0]?.parts.filter((part) => part.kind !== 'same');
    assert.deepEqual(parts?.map((part) => [part.kind, part.struck]), [['added', true]]);
  });
});

describe('drawing a change collapsed to what he chose', () => {
  const drawn = (before: string, proposed: string, changes: [number, ChangeChoice][]) =>
    paragraphsOf(
      piecesAfter(reviewed(before, proposed), { changes: new Map(changes), letters: new Map(), collapsed: new Set(changes.map(([at]) => at)) }),
      { showTidied: true },
    );

  /** The one resolved part of a paragraph, and whether the paragraph still wants a mark in the margin. */
  const resolvedIn = (before: string, proposed: string, decision: ChangeChoice) => {
    const [paragraph] = drawn(before, proposed, [[0, decision]]);
    return {
      part: paragraph?.parts.find((part) => part.kind === 'resolved'),
      stillOpen: paragraph?.parts.some((part) => part.kind === 'removed' || part.kind === 'added'),
      marked: paragraph?.changed,
    };
  };

  it('draws his old text alone, when he chose it', () => {
    assert.deepEqual(resolvedIn('Stara kuća.', 'Nova kuća.', { chosen: 'old' }), {
      part: { kind: 'resolved', text: 'Stara', opensChange: true },
      stillOpen: false,
      marked: false,
    });
  });

  it('draws the proposal alone, when he chose it', () => {
    assert.deepEqual(resolvedIn('Stara kuća.', 'Nova kuća.', { chosen: 'proposed' }), {
      part: { kind: 'resolved', text: 'Nova', opensChange: true },
      stillOpen: false,
      marked: false,
    });
  });

  it('draws his own wording alone, with no sign of the others', () => {
    assert.deepEqual(resolvedIn('Stara kuća.', 'Nova kuća.', { chosen: 'own', own: 'Moja' }), {
      part: { kind: 'resolved', text: 'Moja', opensChange: true },
      stillOpen: false,
      marked: false,
    });
  });

  it('keeps a part for what left nothing to show, so that it can be found again', () => {
    const empty = { kind: 'resolved', text: '', opensChange: true };

    assert.deepEqual(resolvedIn('Prvi kraj.', 'Prvi novi kraj.', { chosen: 'old' }).part, empty);
    assert.deepEqual(resolvedIn('Prvi stari kraj.', 'Prvi kraj.', { chosen: 'proposed' }).part, empty);
    assert.deepEqual(resolvedIn('Stara kuća.', 'Nova kuća.', { chosen: 'own', own: '' }).part, empty);
  });

  it('keeps marking a paragraph with another change still open', () => {
    const [paragraph] = drawn('Stara kuća i dugo pričamo o tome i pala je.', 'Nova kuća i dugo pričamo o tome i stoji.', [[0, { chosen: 'proposed' }]]);

    assert.equal(paragraph?.changed, true);
  });

  it('breaks the paragraph where he chose a split, and joins it where he chose the old text', () => {
    const texts = (decision: ChangeChoice) =>
      drawn('Prvi. Drugi.', 'Prvi.\n\nDrugi.', [[0, decision]]).map((paragraph) => paragraph.parts.map((part) => part.text).join(''));

    assert.deepEqual(texts({ chosen: 'proposed' }), ['Prvi.', 'Drugi.']);
    assert.deepEqual(texts({ chosen: 'old' }), ['Prvi. Drugi.']);
  });

  it('leaves no way for accepting to change the text', () => {
    assert.equal(after(BEFORE, PROPOSED, [[0, { chosen: 'proposed' }], [1, { chosen: 'proposed' }]]), PROPOSED);
  });

  it('keeps a word whose letter he put back as a part, so that it can be changed again', () => {
    const pieces = piecesAfter(reviewed('Tu je sumu.', 'Tu je šumu.'), { changes: new Map(), letters: new Map([[0, ['s']]]) });
    const part = paragraphsOf(pieces, { showTidied: true })[0]?.parts.find((one) => one.kind === 'tidied');

    assert.deepEqual(part, {
      kind: 'tidied',
      text: 'sumu',
      was: 'sumu',
      proposed: 'šumu',
      letters: ['s'],
      tidyAt: 0,
      opensChange: false,
    });
  });

  it('numbers tidied words in reading order', () => {
    const parts = paragraphsOf(reviewed('Sumu i kucu.', 'Šumu i kuću.'), { showTidied: true })[0]?.parts ?? [];

    assert.deepEqual(parts.filter((part) => part.kind === 'tidied').map((part) => part.tidyAt), [0, 1]);
  });
});
