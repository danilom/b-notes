import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { diffTexts, mergeCloseChanges, separateTidying } from '../src/notes/text-diff.ts';
import { createDiffReview } from '../src/ui/diff-review.ts';

const BEFORE = 'Stari most stoji nad rekom. Ljudi prelaze preko njega svaki dan i ne gledaju dole.';
const AFTER = 'Stari kameni most stoji nad rekom. Ljudi ga prelaze svakog jutra i ne gledaju dole.';
const pieces = mergeCloseChanges(separateTidying(diffTexts(BEFORE, AFTER)));
const changeCount = pieces.filter((piece) => piece.kind === 'change').length;
const nothing = (): void => undefined;

/** How many changes the drawing shows as dealt with, the way an accepted one is drawn. */
const drawnAsNew = (review: ReturnType<typeof createDiffReview>): number =>
  review.piecesNow().filter((piece) => piece.kind === 'change' && piece.resolved === true).length;

describe('the sides of a change', () => {
  it('says which side is nothing, so the bar can say so on its button', () => {
    const changed = mergeCloseChanges(separateTidying(diffTexts('Most stoji nad rekom. Ljudi prelaze preko njega svaki dan i gledaju vodu dugo.', 'Most stoji nad širokom rekom. Ljudi prelaze preko njega svaki dan i gledaju vodu.')));
    const editing = createDiffReview(changed, nothing).editing();
    const sides = changed.flatMap((piece, at) => (piece.kind === 'change' ? [at] : [])).map((_, at) => editing.sidesOf(at));
    assert.deepEqual(sides, [
      { hasOld: false, hasNew: true },
      { hasOld: true, hasNew: false },
    ]);
  });
});

describe('showing only the new text', () => {
  it('draws every undecided change as its new text, without deciding any of them', () => {
    assert.ok(changeCount >= 2);
    const review = createDiffReview(pieces, nothing, true);
    assert.equal(drawnAsNew(review), changeCount);
    assert.equal(review.hasDecisions(), false);
  });

  it('puts in the same text as the red-and-green view does', () => {
    assert.equal(createDiffReview(pieces, nothing, true).textNow(), createDiffReview(pieces, nothing, false).textNow());
  });

  it('keeps what he decided, drawn as he decided it, when the view is switched either way', () => {
    const review = createDiffReview(pieces, nothing, true);
    review.editing().onUndo(0);
    review.setShowsOnlyNew(false);
    review.setShowsOnlyNew(true);
    assert.equal(review.hasDecisions(), true);
    const first = review.piecesNow().find((piece) => piece.kind === 'change');
    assert.equal(first?.kind === 'change' && first.undone, true);
    assert.ok(!review.textNow().includes('kameni'));
  });

  it('opens one change into red and green to look at, deciding nothing and leaving the rest as they were', () => {
    const review = createDiffReview(pieces, nothing, true);
    const editing = review.editing();
    assert.equal(editing.isShownAsNew?.(0), true);
    editing.onOpen?.(0);
    assert.equal(review.editing().isShownAsNew?.(0), false);
    assert.equal(review.editing().isResolved(0), false);
    assert.equal(drawnAsNew(review), changeCount - 1);
    assert.equal(review.hasDecisions(), false);
  });

  it('offers nothing but the usual choices in the red-and-green view, so Vidi predlog never appears there', () => {
    const editing = createDiffReview(pieces, nothing, false).editing();
    assert.equal(editing.isShownAsNew?.(0), false);
    assert.equal(editing.isResolved(0), false);
  });

  it('folds an opened change back when the view is switched off and on again', () => {
    const review = createDiffReview(pieces, nothing, true);
    review.editing().onOpen?.(0);
    review.setShowsOnlyNew(false);
    assert.equal(drawnAsNew(review), 0);
    review.setShowsOnlyNew(true);
    assert.equal(drawnAsNew(review), changeCount);
  });
});
