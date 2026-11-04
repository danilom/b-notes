import { alignSequences } from './sequence-alignment.ts';
import { type TextPiece, withoutDiacritics } from './text-diff.ts';

/**
 * What he has done to a proposal. Everything starts accepted: the proposal is what
 * is on the page, and these are only the places he stepped in.
 */
export interface ReviewDecisions {
  /** By a change's place among the changes. */
  changes: ReadonlyMap<number, ChangeDecision>;
  /** By a tidied piece's place among the tidied, the letter chosen for each slot. */
  letters: ReadonlyMap<number, readonly string[]>;
}

export type ChangeDecision = { kind: 'undone' } | { kind: 'edited'; text: string };

export const noDecisions = (): ReviewDecisions => ({ changes: new Map(), letters: new Map() });

/** A run of a tidied word: either as it stands, or a place where a letter was put right. */
export type LetterSegment =
  | { kind: 'fixed'; text: string }
  | { kind: 'slot'; proposed: string; choices: readonly string[] };

/** The letters a plain one can stand for. `dj` is how he types `đ`. */
const FAMILIES = new Map([
  ['c', ['c', 'č', 'ć']],
  ['s', ['s', 'š']],
  ['z', ['z', 'ž']],
  ['d', ['d', 'đ', 'dj']],
]);

const inCaseOf = (model: string, letters: string): string =>
  model === model.toLowerCase() ? letters : letters.charAt(0).toUpperCase() + letters.slice(1);

/** What may stand here: what was there first, then the rest of its family. Empty if it has none. */
function choicesFor(original: string, proposed: string): string[] {
  const family = FAMILIES.get(withoutDiacritics(proposed).toLowerCase());
  if (family === undefined) return [];
  return [...new Set([original, ...family.map((letters) => inCaseOf(proposed, letters))])];
}

/**
 * A tidied word taken apart at the letters that were put right, so that each can be
 * offered with what else it might have been. What has no alternatives, such as a
 * comma, simply stands as it is.
 */
export function letterSegmentsOf(was: string, proposed: string): LetterSegment[] {
  const segments: LetterSegment[] = [];
  let [gone, arrived] = ['', ''];

  const flush = (): void => {
    if (arrived === '') {
      gone = '';
      return;
    }
    const choices = choicesFor(gone, arrived);
    if (choices.length > 0) segments.push({ kind: 'slot', proposed: arrived, choices });
    else segments.push({ kind: 'fixed', text: arrived });
    [gone, arrived] = ['', ''];
  };

  for (const { kind, text } of alignSequences([...was.normalize('NFC')], [...proposed.normalize('NFC')])) {
    if (kind === 'onlyFrom') gone += text;
    else if (kind === 'onlyTo') arrived += text;
    else {
      flush();
      const open = segments.at(-1);
      if (open?.kind === 'fixed') open.text += text;
      else segments.push({ kind: 'fixed', text });
    }
  }
  flush();
  return segments;
}

/** The word with each slot holding what was chosen for it, or what was proposed. */
export function wordWithLetters(segments: readonly LetterSegment[], chosen: readonly string[]): string {
  let slot = 0;
  return segments
    .map((segment) => {
      if (segment.kind === 'fixed') return segment.text;
      const letter = chosen[slot] ?? segment.proposed;
      slot += 1;
      return letter;
    })
    .join('');
}

/** The pieces as his decisions leave them. What was proposed stays known, so that it can be gone back to. */
export function piecesAfter(pieces: readonly TextPiece[], { changes, letters }: ReviewDecisions): TextPiece[] {
  let [changeAt, tidyAt] = [0, 0];

  return pieces.map((piece): TextPiece => {
    if (piece.kind === 'change') {
      const decision = changes.get(changeAt);
      changeAt += 1;
      if (decision?.kind === 'undone') return { ...piece, undone: true };
      if (decision?.kind === 'edited') return { ...piece, added: decision.text };
      return piece;
    }
    if (piece.kind === 'tidy') {
      const chosen = letters.get(tidyAt);
      tidyAt += 1;
      if (chosen === undefined) return piece;
      const added = wordWithLetters(letterSegmentsOf(piece.removed, piece.added), chosen);
      return { ...piece, added, proposed: piece.added };
    }
    return piece;
  });
}

/** The text that pressing the main button would give him: what is on the page, and nothing else. */
export const textAfter = (pieces: readonly TextPiece[]): string =>
  pieces
    .map((piece) => {
      if (piece.kind === 'same') return piece.text;
      return piece.undone === true ? piece.removed : piece.added;
    })
    .join('');
