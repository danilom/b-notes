import type { TextPiece } from '../notes/text-diff.ts';
import { type ChangeDecision, piecesAfter, textAfter } from '../notes/text-review.ts';
import type { BarState, DiffEditing } from './diff-change-bar.ts';

/** One proposal being gone through: what he has done to it, and where he is in it. */
export interface DiffReview {
  /** The pieces as his decisions leave them, for drawing. */
  piecesNow: () => TextPiece[];
  /** What the main button would make of his text. */
  textNow: () => string;
  /** How the view reports what he does, for the drawing about to be made. */
  editing: () => DiffEditing;
  /** Whether he has done anything here that closing would lose. */
  hasDecisions: () => boolean;
  /** Whether the changes he hasn't decided are drawn as their new text alone. */
  showsOnlyNew: () => boolean;
  /** Draws the undecided changes as their new text alone, or in red and green; folds back any he opened to look at. */
  setShowsOnlyNew: (only: boolean) => void;
}

/**
 * @param pieces The proposal as compared, tidied and merged; decisions go by place in this list.
 * @param redraw Called after anything he does, for the view to be drawn again.
 * @param showsOnlyNew Whether the undecided changes start drawn as their new text alone.
 */
export function createDiffReview(pieces: readonly TextPiece[], redraw: () => void, showsOnlyNew = false): DiffReview {
  const changes = new Map<number, ChangeDecision>();
  const letters = new Map<number, string[]>();
  /** Undecided changes he opened with Vidi predlog, drawn in red and green though the rest are not. */
  const opened = new Set<number>();
  let isOnlyNew = showsOnlyNew;
  let currentChange: number | undefined;
  let barState: BarState = 'shown';

  /** Drawn as their new text alone, and so as an accepted one is; never recorded as accepted. */
  const isShownAsNew = (at: number): boolean => isOnlyNew && !changes.has(at) && !opened.has(at);

  /**
   * Accepting an undecided change only for the drawing: it puts in the same text as leaving it,
   * which is what the main button does with whatever he hasn't decided.
   */
  const piecesNow = (): TextPiece[] => {
    if (!isOnlyNew) return piecesAfter(pieces, { changes, letters });
    const drawn = new Map(changes);
    const changeCount = pieces.filter((piece) => piece.kind === 'change').length;
    for (let at = 0; at < changeCount; at += 1) if (isShownAsNew(at)) drawn.set(at, { kind: 'accepted' });
    return piecesAfter(pieces, { changes: drawn, letters });
  };

  const decide = (at: number, decision: ChangeDecision | null): void => {
    if (decision === null) changes.delete(at);
    else changes.set(at, decision);
    currentChange = at;
    // Decided, it goes quiet until he moves on; put back to the proposal, its choices are wanted again.
    barState = decision === null ? 'shown' : 'quiet';
    redraw();
  };

  const wordingOf = (at: number): string => {
    const wording = piecesNow().flatMap((piece) => {
      if (piece.kind !== 'change') return [];
      return [piece.undone === true ? piece.removed : piece.added];
    });
    return wording[at] ?? '';
  };

  return {
    piecesNow,
    textNow: () => textAfter(piecesAfter(pieces, { changes, letters })),
    hasDecisions: () => changes.size > 0 || letters.size > 0,
    showsOnlyNew: () => isOnlyNew,
    setShowsOnlyNew: (only) => {
      isOnlyNew = only;
      opened.clear();
      redraw();
    },
    editing: () => ({
      ...(currentChange === undefined ? {} : { startAt: currentChange }),
      barStarts: barState,
      onBarState: (state) => {
        barState = state;
      },
      isResolved: (at) => changes.has(at) || isShownAsNew(at),
      sidesOf: (at) => {
        const change = pieces.flatMap((piece) => (piece.kind === 'change' ? [piece] : []))[at];
        return { hasOld: /\S/.test(change?.removed ?? ''), hasNew: /\S/.test(change?.added ?? '') };
      },
      isShownAsNew,
      wordingOf,
      onUndo: (at) => decide(at, { kind: 'undone' }),
      onAccept: (at) => decide(at, { kind: 'accepted' }),
      onReopen: (at) => decide(at, null),
      onOpen: (at) => {
        opened.add(at);
        currentChange = at;
        barState = 'shown';
        redraw();
      },
      onEdit: (at, text) => decide(at, { kind: 'edited', text }),
      onCancelEdit: redraw,
      lettersOf: (tidyAt) => letters.get(tidyAt) ?? [],
      onPickLetter: (tidyAt, slot, letter) => {
        const chosen = [...(letters.get(tidyAt) ?? [])];
        chosen[slot] = letter;
        letters.set(tidyAt, chosen);
        // Chosen, the letter is done, and the bar does not jump to the current change instead.
        if (barState === 'shown') barState = 'quiet';
        redraw();
      },
      onCurrent: (at) => {
        currentChange = at;
      },
    }),
  };
}
