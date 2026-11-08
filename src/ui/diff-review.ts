import { type TextPiece, chosenText } from '../notes/text-diff.ts';
import { type ChangeChoice, piecesAfter, textAfter } from '../notes/text-review.ts';
import type { BarState, DiffEditing } from './diff-change-bar.ts';

/** One proposal being gone through: what he has chosen in it, and where he is in it. */
export interface DiffReview {
  /** The pieces as his choices leave them, for drawing. */
  piecesNow: () => TextPiece[];
  /** What the main button would make of his text. */
  textNow: () => string;
  /** How the view reports what he does, for the drawing about to be made. */
  editing: () => DiffEditing;
  /** Whether he has chosen anything but the proposal, or written anything, that closing would lose. */
  hasDecisions: () => boolean;
  /** Whether the changes were last all collapsed to their chosen wording, by the checkbox. */
  showsOnlyNew: () => boolean;
  /** Collapses every change to its chosen wording, or opens every one. Chooses nothing. */
  setShowsOnlyNew: (only: boolean) => void;
}

/**
 * Every change always has a wording chosen, the proposal until he picks another, so
 * nothing here is ever undecided. What a change can be besides is open, showing each
 * wording side by side, or collapsed to the chosen one; choosing collapses it.
 *
 * @param pieces The proposal as compared, tidied and merged; choices go by place in this list.
 * @param redraw Called after anything he does, for the view to be drawn again.
 * @param showsOnlyNew Whether the changes start collapsed.
 */
export function createDiffReview(pieces: readonly TextPiece[], redraw: () => void, showsOnlyNew = false): DiffReview {
  const changePieces = pieces.flatMap((piece) => (piece.kind === 'change' ? [piece] : []));
  const everyChange = (): Set<number> => new Set(changePieces.map((_, at) => at));

  const choices = new Map<number, ChangeChoice>();
  const letters = new Map<number, string[]>();
  let collapsed = showsOnlyNew ? everyChange() : new Set<number>();
  let isOnlyNew = showsOnlyNew;
  let currentChange: number | undefined;
  let barState: BarState = 'shown';

  const choiceAt = (at: number): ChangeChoice => choices.get(at) ?? { chosen: 'proposed' };
  const piecesNow = (): TextPiece[] => piecesAfter(pieces, { changes: choices, letters, collapsed });

  /** Chosen, it collapses, and the bar goes quiet until he moves on. */
  const settle = (at: number, choice: ChangeChoice): void => {
    choices.set(at, choice);
    collapsed.add(at);
    currentChange = at;
    barState = 'quiet';
    redraw();
  };

  const choose = (at: number, chosen: 'old' | 'proposed'): void => {
    const { own } = choiceAt(at);
    settle(at, own === undefined ? { chosen } : { chosen, own });
  };

  /** Typed out the same as the old text or the proposal is choosing that one, not writing a third. */
  const onEdit = (at: number, text: string): void => {
    const change = changePieces[at];
    const { own } = choiceAt(at);
    const kept = own === undefined ? {} : { own };
    if (text === change?.added) settle(at, { chosen: 'proposed', ...kept });
    else if (text === change?.removed) settle(at, { chosen: 'old', ...kept });
    else settle(at, { chosen: 'own', own: text });
  };

  const hasDecisions = (): boolean =>
    letters.size > 0 || [...choices.values()].some(({ chosen, own }) => chosen !== 'proposed' || own !== undefined);

  return {
    piecesNow,
    textNow: () => textAfter(piecesAfter(pieces, { changes: choices, letters })),
    hasDecisions,
    showsOnlyNew: () => isOnlyNew,
    setShowsOnlyNew: (only) => {
      isOnlyNew = only;
      collapsed = only ? everyChange() : new Set();
      redraw();
    },
    editing: () => ({
      ...(currentChange === undefined ? {} : { startAt: currentChange }),
      barStarts: barState,
      onBarState: (state) => {
        barState = state;
      },
      choiceOf: (at) => {
        const change = changePieces[at];
        const { chosen, own } = choiceAt(at);
        return {
          chosen,
          isOpen: !collapsed.has(at),
          hasOld: /\S/.test(change?.removed ?? ''),
          hasProposed: /\S/.test(change?.added ?? ''),
          hasOwn: own !== undefined,
        };
      },
      onChoose: choose,
      onOpen: (at) => {
        collapsed.delete(at);
        currentChange = at;
        barState = 'shown';
        redraw();
      },
      // His own wording if he has one, to go on with; otherwise what is going in now.
      wordingOf: (at) => {
        const change = changePieces[at];
        const { chosen, own } = choiceAt(at);
        if (change === undefined) return '';
        return own ?? chosenText({ removed: change.removed, added: change.added, chosen });
      },
      onEdit,
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
