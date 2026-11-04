import type { TextPiece } from '../notes/text-diff.ts';
import { type ChangeDecision, piecesAfter, textAfter } from '../notes/text-review.ts';
import type { DiffEditing } from './diff-change-bar.ts';

/** One proposal being gone through: what he has done to it, and where he is in it. */
export interface DiffReview {
  /** The pieces as his decisions leave them, for drawing. */
  piecesNow: () => TextPiece[];
  /** What the main button would make of his text. */
  textNow: () => string;
  /** How the view reports what he does, for the drawing about to be made. */
  editing: () => DiffEditing;
}

/**
 * @param pieces The proposal as compared, tidied and merged; decisions go by place in this list.
 * @param redraw Called after anything he does, for the view to be drawn again.
 */
export function createDiffReview(pieces: readonly TextPiece[], redraw: () => void): DiffReview {
  const changes = new Map<number, ChangeDecision>();
  const letters = new Map<number, string[]>();
  let currentChange: number | undefined;
  let isBarClosed = false;

  const piecesNow = (): TextPiece[] => piecesAfter(pieces, { changes, letters });

  const decide = (at: number, decision: ChangeDecision | null): void => {
    if (decision === null) changes.delete(at);
    else changes.set(at, decision);
    currentChange = at;
    isBarClosed = false;
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
    textNow: () => textAfter(piecesNow()),
    editing: () => ({
      ...(currentChange === undefined ? {} : { startAt: currentChange }),
      startsClosed: isBarClosed,
      onBarClosed: (closed) => {
        isBarClosed = closed;
      },
      isResolved: (at) => changes.has(at),
      wordingOf,
      onUndo: (at) => decide(at, { kind: 'undone' }),
      onAccept: (at) => decide(at, { kind: 'accepted' }),
      onReopen: (at) => decide(at, null),
      onEdit: (at, text) => decide(at, { kind: 'edited', text }),
      onCancelEdit: redraw,
      lettersOf: (tidyAt) => letters.get(tidyAt) ?? [],
      onPickLetter: (tidyAt, slot, letter) => {
        const chosen = [...(letters.get(tidyAt) ?? [])];
        chosen[slot] = letter;
        letters.set(tidyAt, chosen);
        redraw();
      },
      onCurrent: (at) => {
        currentChange = at;
      },
    }),
  };
}
