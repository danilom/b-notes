import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { diffTexts, mergeCloseChanges, separateTidying } from '../src/notes/text-diff.ts';
import { createDiffReview } from '../src/ui/diff-review.ts';

const BEFORE = 'Stari most stoji nad rekom. Ljudi prelaze preko njega svaki dan i ne gledaju dole.';
const AFTER = 'Stari kameni most stoji nad rekom. Ljudi ga prelaze svakog jutra i ne gledaju dole.';
const pieces = mergeCloseChanges(separateTidying(diffTexts(BEFORE, AFTER)));
const changeCount = pieces.filter((piece) => piece.kind === 'change').length;
const nothing = (): void => undefined;

/** How many changes the drawing shows collapsed to one wording. */
const collapsedCount = (review: ReturnType<typeof createDiffReview>): number =>
  review.piecesNow().filter((piece) => piece.kind === 'change' && piece.collapsed === true).length;

describe('the sides of a change', () => {
  it('says which side is nothing, so the bar can say so on its button', () => {
    const changed = mergeCloseChanges(separateTidying(diffTexts('Most stoji nad rekom. Ljudi prelaze preko njega svaki dan i gledaju vodu dugo.', 'Most stoji nad širokom rekom. Ljudi prelaze preko njega svaki dan i gledaju vodu.')));
    const editing = createDiffReview(changed, nothing).editing();
    const sides = [0, 1].map((at) => {
      const { hasOld, hasProposed } = editing.choiceOf(at);
      return { hasOld, hasProposed };
    });
    assert.deepEqual(sides, [
      { hasOld: false, hasProposed: true },
      { hasOld: true, hasProposed: false },
    ]);
  });
});

describe('choosing a wording', () => {
  it('starts every change on the proposal, open, with nothing to lose by closing', () => {
    assert.ok(changeCount >= 2);
    const review = createDiffReview(pieces, nothing);
    assert.deepEqual(review.editing().choiceOf(0), { chosen: 'proposed', isOpen: true, hasOld: false, hasProposed: true, hasOwn: false });
    assert.equal(review.textNow(), AFTER);
    assert.equal(review.hasDecisions(), false);
  });

  it('collapses a change to the wording chosen, and puts that one in', () => {
    const review = createDiffReview(pieces, nothing);
    review.editing().onChoose(0, 'old');
    assert.equal(review.editing().choiceOf(0).isOpen, false);
    assert.equal(collapsedCount(review), 1);
    assert.ok(!review.textNow().includes('kameni'));
    assert.equal(review.hasDecisions(), true);
  });

  it('keeps his own wording when he picks another, and goes on from it on the next edit', () => {
    const review = createDiffReview(pieces, nothing);
    review.editing().onEdit(0, ' drveni');
    review.editing().onChoose(0, 'proposed');
    const editing = review.editing();
    assert.deepEqual(editing.choiceOf(0), { chosen: 'proposed', isOpen: false, hasOld: false, hasProposed: true, hasOwn: true });
    assert.equal(editing.wordingOf(0), ' drveni');
    assert.equal(review.textNow(), AFTER);
    assert.equal(review.hasDecisions(), true);
  });

  it('counts typing out the proposal again as choosing it, not as a wording of his own', () => {
    const review = createDiffReview(pieces, nothing);
    review.editing().onEdit(0, review.editing().wordingOf(0));
    assert.deepEqual(review.editing().choiceOf(0), { chosen: 'proposed', isOpen: false, hasOld: false, hasProposed: true, hasOwn: false });
    assert.equal(review.hasDecisions(), false);
  });

  it('hands the next drawing alone the change just chosen and its wording, for it to settle from', () => {
    const review = createDiffReview(pieces, nothing);
    review.editing().onChoose(1, 'old');
    assert.deepEqual(review.editing().settling, { at: 1, from: 'old' });
    assert.equal(review.editing().settling, undefined);
    review.editing().onEdit(0, ' drveni');
    assert.deepEqual(review.editing().settling, { at: 0, from: 'own' });
  });

  it('passes on where the chosen words stood, for them to slide from', () => {
    const review = createDiffReview(pieces, nothing);
    review.editing().onChoose(1, 'proposed', { left: 240, top: 80 });
    assert.deepEqual(review.editing().settling, { at: 1, from: 'proposed', startedAt: { left: 240, top: 80 } });
  });

  it('leaves him where he stepped to, bar and all, when a choice lands after he has moved on', () => {
    const review = createDiffReview(pieces, nothing);
    const editing = review.editing();
    editing.onCurrent(0);
    editing.onCurrent(1);
    editing.onBarState('shown');
    editing.onChoose(0, 'old');
    assert.equal(review.editing().startAt, 1);
    assert.equal(review.editing().barStarts, 'shown');
    assert.equal(review.editing().choiceOf(0).chosen, 'old');
  });

  it('quiets the bar over the change he chose, when he is still on it', () => {
    const review = createDiffReview(pieces, nothing);
    const editing = review.editing();
    editing.onCurrent(0);
    editing.onChoose(0, 'old');
    assert.equal(review.editing().startAt, 0);
    assert.equal(review.editing().barStarts, 'quiet');
  });

  it('opens a collapsed change again without changing what goes in', () => {
    const review = createDiffReview(pieces, nothing);
    review.editing().onChoose(0, 'old');
    const text = review.textNow();
    review.editing().onOpen(0);
    assert.deepEqual(review.editing().choiceOf(0), { chosen: 'old', isOpen: true, hasOld: false, hasProposed: true, hasOwn: false });
    assert.equal(review.textNow(), text);
  });
});

describe('showing only the new text', () => {
  it('collapses every change to the proposal, choosing nothing', () => {
    const review = createDiffReview(pieces, nothing, true);
    assert.equal(collapsedCount(review), changeCount);
    assert.equal(review.hasDecisions(), false);
    assert.equal(review.textNow(), createDiffReview(pieces, nothing, false).textNow());
  });

  it('shows every change the way chosen, forgetting the ones he opened himself', () => {
    assert.ok(changeCount >= 3);
    const review = createDiffReview(pieces, nothing, false);
    review.editing().onOpen(0);
    review.setShowsOnlyNew(true);
    const isOpen = (at: number): boolean => review.editing().choiceOf(at).isOpen;
    assert.deepEqual([isOpen(0), isOpen(1), isOpen(2)], [false, false, false]);
  });

  it('keeps a decided change collapsed when the changes are shown as old and new', () => {
    const review = createDiffReview(pieces, nothing, true);
    review.editing().onChoose(1, 'old');
    review.editing().onOpen(1);
    review.setShowsOnlyNew(false);
    const isOpen = (at: number): boolean => review.editing().choiceOf(at).isOpen;
    assert.deepEqual([isOpen(0), isOpen(1), isOpen(2)], [true, false, true]);
    assert.equal(review.editing().choiceOf(1).chosen, 'old');
  });

  it('collapses again a change he opened when the view is set to what it already is', () => {
    const review = createDiffReview(pieces, nothing, true);
    review.editing().onOpen(0);
    assert.equal(review.editing().choiceOf(0).isOpen, true);
    review.setShowsOnlyNew(true);
    assert.equal(review.editing().choiceOf(0).isOpen, false);
  });

  it('lets him open one change after the view is set', () => {
    const review = createDiffReview(pieces, nothing, false);
    review.setShowsOnlyNew(true);
    review.editing().onOpen(2);
    assert.equal(review.editing().choiceOf(2).isOpen, true);
    assert.equal(review.editing().choiceOf(0).isOpen, false);
  });
});
