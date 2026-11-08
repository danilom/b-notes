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
  /** Whether the changes he hasn't opened or collapsed himself are shown collapsed. */
  showsOnlyNew: () => boolean;
  /** Collapses or opens the changes he hasn't opened or collapsed himself. Chooses nothing. */
  setShowsOnlyNew: (only: boolean) => void;
}

/** What he last did to how a change is shown, which outranks the checkbox. */
type Shown = 'opened' | 'collapsed';

/**
 * Every change always has a wording chosen, the proposal until he picks another, so
 * nothing here is ever undecided. What a change can be besides is open, showing each
 * wording side by side, or collapsed to the chosen one.
 *
 * Whether it is open is his to say, a change at a time: clicking one opens it, and
 * choosing a wording collapses it. A change he has done neither to follows "Prikaži samo
 * novi tekst", which is so only ever a statement about those, and never undoes his own.
 *
 * @param pieces The proposal as compared, tidied and merged; choices go by place in this list.
 * @param redraw Called after anything he does, for the view to be drawn again.
 * @param showsOnlyNew Whether the changes start collapsed.
 */
export function createDiffReview(pieces: readonly TextPiece[], redraw: () => void, showsOnlyNew = false): DiffReview {
  const changePieces = pieces.flatMap((piece) => (piece.kind === 'change' ? [piece] : []));

  const choices = new Map<number, ChangeChoice>();
  const letters = new Map<number, string[]>();
  const shownByHim = new Map<number, Shown>();
  let isOnlyNew = showsOnlyNew;
  let currentChange: number | undefined;
  let barState: BarState = 'shown';

  const choiceAt = (at: number): ChangeChoice => choices.get(at) ?? { chosen: 'proposed' };
  const isCollapsed = (at: number): boolean => (shownByHim.get(at) ?? (isOnlyNew ? 'collapsed' : 'opened')) === 'collapsed';
  const collapsedNow = (): Set<number> => new Set(changePieces.flatMap((_, at) => (isCollapsed(at) ? [at] : [])));
  const piecesNow = (): TextPiece[] => piecesAfter(pieces, { changes: choices, letters, collapsed: collapsedNow() });

  /** Chosen, it collapses, and the bar goes quiet until he moves on. */
  const settle = (at: number, choice: ChangeChoice): void => {
    choices.set(at, choice);
    shownByHim.set(at, 'collapsed');
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
          isOpen: !isCollapsed(at),
          hasOld: /\S/.test(change?.removed ?? ''),
          hasProposed: /\S/.test(change?.added ?? ''),
          hasOwn: own !== undefined,
        };
      },
      onChoose: choose,
      onOpen: (at) => {
        shownByHim.set(at, 'opened');
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
