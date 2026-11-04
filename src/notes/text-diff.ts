import { alignSequences } from './sequence-alignment.ts';

/**
 * Two texts as one list, in reading order: what they share, and what stands in
 * one where the other has something else.
 *
 * Nothing is left out or tidied. The `same` and `removed` parts joined are the
 * first text exactly, spaces and all, and the `same` and `added` parts the second,
 * but for how it stores its line endings and letters, which `same` takes from the
 * first. So taking one change and not another is only a matter of which side of
 * it to join, and what he has keeps its own line endings whichever he takes.
 *
 * `tidy` is a change like any other in what it holds, and only ever made by
 * {@link separateTidying}, for a change nobody needs to read.
 */
export type TextPiece =
  | { kind: 'same'; text: string }
  | { kind: 'change' | 'tidy'; removed: string; added: string };

/**
 * A word, a run of spaces and breaks, or one mark of punctuation.
 *
 * Punctuation stands alone because a proofreader's comma is the edit, and the
 * word beside it did not change. Letters are taken by Unicode class so that
 * `š` does not split a word, and combining marks count, because a text pasted
 * from elsewhere can spell `č` as `c` and a mark.
 */
const TOKEN = /\s+|[\p{L}\p{M}\p{N}]+|[^\s\p{L}\p{M}\p{N}]/gu;

const tokensOf = (text: string): string[] => text.match(TOKEN) ?? [];

/**
 * What a token is compared as, leaving out differences no reader could see.
 *
 * Windows and everything else end a line differently, and an AI's reply or a
 * pasted text can spell `č` as a `c` and a mark. Left in, either marks every line
 * or every such word of a text as changed, burying the changes that are real.
 */
const comparedAs = (token: string): string => token.replace(/\r\n?/g, '\n').normalize('NFC');

const BLANK_LINES = /\r?\n[ \t]*\r?\n(?:[ \t]*\r?\n)*/;

/** The letters under their diacritics: `š` to `s`. `đ` has none to take off, being its own letter. */
const withoutDiacritics = (text: string): string =>
  text.replaceAll('đ', 'd').replaceAll('Đ', 'D').normalize('NFD').replace(/\p{M}/gu, '');

/**
 * What a token is lined up by, which is looser than whether it changed.
 *
 * `kucu` and `kuću` are the same word in the same place, and so are a space and
 * two. Lined up as different things they push everything around them out of step,
 * and `staru kucu` against `novu kuću` comes back as `kucu` becoming `novu kuću`.
 * Whether they count as changed is decided afterwards.
 */
const linedUpBy = (token: string): string => (/\S/.test(token) ? withoutDiacritics(token) : ' ');

/**
 * @param before The text as it stands.
 * @param after The text it would become.
 */
export function diffTexts(before: string, after: string): TextPiece[] {
  const [beforeTokens, afterTokens] = [tokensOf(before), tokensOf(after)];
  const pieces: TextPiece[] = [];
  let [beforeAt, afterAt] = [0, 0];

  /** A variant of one token stands as a change alone, so tidying never rides on a change of wording. */
  let lastWasVariant = false;

  const openChange = (): Extract<TextPiece, { kind: 'change' | 'tidy' }> => {
    const open = pieces.at(-1);
    if (open?.kind === 'change' && !lastWasVariant) return open;
    const change = { kind: 'change' as const, removed: '', added: '' };
    pieces.push(change);
    lastWasVariant = false;
    return change;
  };

  for (const { kind } of alignSequences(beforeTokens.map(linedUpBy), afterTokens.map(linedUpBy))) {
    const [was, now] = [beforeTokens[beforeAt] ?? '', afterTokens[afterAt] ?? ''];

    if (kind === 'same' && comparedAs(was) === comparedAs(now)) {
      const open = pieces.at(-1);
      if (open?.kind === 'same') open.text += was;
      else pieces.push({ kind: 'same', text: was });
    } else if (kind === 'same') {
      pieces.push({ kind: 'change', removed: was, added: now });
      lastWasVariant = true;
    } else if (kind === 'onlyFrom') {
      openChange().removed += was;
    } else {
      openChange().added += now;
    }
    if (kind !== 'onlyTo') beforeAt += 1;
    if (kind !== 'onlyFrom') afterAt += 1;
  }
  return pieces;
}

/**
 * Whether a change only tidies: nobody needs to read it to know it does no harm.
 *
 * He drops his diacritics and his spacing wanders, so a proofreader's reply is
 * mostly this, and every one marked hides the few changes of wording among them.
 * But hiding the wrong thing is a change to his writing he never saw, so this
 * says yes only to what is plainly safe, and everything else stays in front of
 * him:
 *
 * - A plain letter gaining its diacritic. Not one losing it, nor `ć` becoming
 *   `č`, which can be a correction, and can be a mistake.
 * - One run of spacing becoming another. Not a space appearing or going between
 *   words, which makes them different words; and not at the start of a line,
 *   where his leading spaces are how he ranks his titles.
 * - As long as the paragraphs stay as they are. One split or joined is his
 *   structure, not his spacing.
 * - And his lines inside a paragraph, unless told otherwise: three changes written
 *   one under the other are three lines, which an AI could flatten.
 */
function isTidying({ removed, added }: Pick<Change, 'removed' | 'added'>, lineBreaks: boolean): boolean {
  if (BLANK_LINES.test(removed) !== BLANK_LINES.test(added)) return false;
  if (!lineBreaks && removed.includes('\n') !== added.includes('\n')) return false;

  const [was, now] = [removed, added].map((text) => text.normalize('NFC').replace(/\s+/g, ' '));
  if (was === undefined || now === undefined || was.length !== now.length) return false;

  for (let at = 0; at < was.length; at += 1) {
    const [before, after] = [was.charAt(at), now.charAt(at)];
    if (before !== after && withoutDiacritics(after) !== before) return false;
  }
  return true;
}

export interface TidyingOptions {
  /** Whether a line break inside a paragraph, coming or going, counts as tidying. */
  lineBreaks: boolean;
}

/**
 * The same pieces, with the changes nobody needs to read set apart as `tidy`.
 *
 * Some of those diacritics will be wrong, since `sto` and `što` are both words and
 * only the meaning says which. Nothing here can tell which ones from two texts, so
 * they are all treated alike, and each stays visible as a letter in colour.
 */
export const separateTidying = (pieces: readonly TextPiece[], { lineBreaks }: TidyingOptions): TextPiece[] =>
  pieces.map((piece) => (piece.kind === 'change' && isTidying(piece, lineBreaks) ? { ...piece, kind: 'tidy' } : piece));

/** A run of a tidied word, and whether its letters are the ones that changed. */
export interface TidiedLetters {
  text: string;
  changed: boolean;
}

/**
 * Which letters of a tidied word are different from what stood there.
 *
 * Told letter by letter, so that he sees what was done for him: one letter in a
 * word, and not the word replaced. Where the two do not line up letter for letter
 * nothing is singled out.
 */
export function tidiedLettersOf({ removed, added }: Pick<Change, 'removed' | 'added'>): TidiedLetters[] {
  const [was, now] = [removed.normalize('NFC'), added.normalize('NFC')];
  if (was.length !== now.length) return [{ text: added, changed: false }];

  const runs: TidiedLetters[] = [];
  for (let at = 0; at < now.length; at += 1) {
    const changed = was.charAt(at) !== now.charAt(at) && /\S/.test(now.charAt(at));
    const open = runs.at(-1);
    if (open?.changed === changed) open.text += now.charAt(at);
    else runs.push({ text: now.charAt(at), changed });
  }
  return runs;
}

/** A run of text in one paragraph as drawn, and whose it is. */
export interface DiffPart {
  /** `spacing-tidied` holds no text: it says spacing was corrected at this spot. */
  kind: 'same' | 'removed' | 'added' | 'tidied' | 'spacing-tidied';
  text: string;
  /** The first part of a change, where a change is carried across paragraphs. */
  opensChange: boolean;
  /** What a `tidied` word was before, so its changed letters can be told. */
  was?: string;
}

export interface DiffParagraph {
  parts: DiffPart[];
  /** Whether anything in it differs, or the break that opens it does. */
  changed: boolean;
}

/**
 * The pieces laid out as paragraphs, for drawing: which ones get a mark in the
 * margin, and what is in each.
 *
 * For the screen only. Unlike the pieces, this does not keep his exact spacing:
 * a blank line becomes the gap between two paragraphs. What is `tidy` is drawn as
 * it would be, in no way marking the paragraph as changed. With `showTidied` a
 * tidied word comes as a part of its own, and tidied spacing leaves a part with
 * no text where it was, having nothing else left to show.
 *
 * A change that is nothing but spacing is not split, because it has no text to
 * show on either side of the break: it stays a part, for the view to make
 * visible. An added one does still break the paragraph, and the text after it
 * counts as changed, since it now starts a paragraph it did not start before.
 */
export function paragraphsOf(pieces: readonly TextPiece[], { showTidied = false } = {}): DiffParagraph[] {
  const paragraphs: DiffParagraph[] = [{ parts: [], changed: false }];
  const startParagraph = (changed: boolean): void => {
    paragraphs.push({ parts: [], changed });
  };

  const addPart = (part: DiffPart): void => {
    const open = paragraphs.at(-1);
    if (open === undefined) return;
    open.parts.push(part);
    open.changed ||= part.kind === 'removed' || part.kind === 'added';
  };

  const addSplit = (kind: DiffPart['kind'], text: string, opensChange: boolean): void => {
    let opening = opensChange;
    text.split(BLANK_LINES).forEach((chunk, at) => {
      if (at > 0) startParagraph(false);
      if (chunk.length === 0) return;
      addPart({ kind, text: chunk, opensChange: opening });
      opening = false;
    });
  };

  for (const piece of pieces) {
    if (piece.kind === 'same') {
      addSplit('same', piece.text, false);
      continue;
    }
    if (piece.kind === 'tidy') {
      if (showTidied && /\S/.test(piece.added)) {
        addPart({ kind: 'tidied', text: piece.added, was: piece.removed, opensChange: false });
        continue;
      }
      if (showTidied) addPart({ kind: 'spacing-tidied', text: '', opensChange: false });
      addSplit('same', piece.added, false);
      continue;
    }
    const { removed, added } = piece;
    if (removed.length > 0) {
      if (/\S/.test(removed)) addSplit('removed', removed, true);
      else addPart({ kind: 'removed', text: removed, opensChange: true });
    }
    if (added.length > 0) {
      const opensChange = removed.length === 0;
      if (/\S/.test(added)) {
        addSplit('added', added, opensChange);
      } else {
        addPart({ kind: 'added', text: added, opensChange });
        if (BLANK_LINES.test(added)) startParagraph(true);
      }
    }
  }
  return paragraphs.filter((paragraph) => paragraph.parts.length > 0);
}

type Change = Extract<TextPiece, { kind: 'change' | 'tidy' }>;

const sizeOf = ({ removed, added }: Change): number => Math.max(removed.length, added.length);

/**
 * Whether what stands between two changes is too little to be worth reading
 * apart from them.
 *
 * Measured against the changes rather than by a fixed size: `je` between two
 * rewritten clauses matched by accident, while the same `je` between two
 * one-letter corrections is most of what is there to read.
 *
 * Never across a line break, whether it stands between the two or is part of one
 * of them. His lines and paragraphs are his, and a change that spanned one could
 * not be read as old sentence, then new sentence.
 */
const holdsBreak = ({ removed, added }: Pick<Change, 'removed' | 'added'>): boolean =>
  removed.includes('\n') || added.includes('\n');

const isAbsorbed = (between: Pick<Change, 'removed' | 'added'>, left: Change, right: Change): boolean =>
  !holdsBreak(between) &&
  !holdsBreak(left) &&
  !holdsBreak(right) &&
  Math.max(between.removed.length, between.added.length) <= sizeOf(left) &&
  Math.max(between.removed.length, between.added.length) <= sizeOf(right);

/** What stands between two changes, as each of the texts has it. */
function stretchOf(pieces: readonly TextPiece[]): Pick<Change, 'removed' | 'added'> {
  let [removed, added] = ['', ''];
  for (const piece of pieces) {
    removed += piece.kind === 'same' ? piece.text : piece.removed;
    added += piece.kind === 'same' ? piece.text : piece.added;
  }
  return { removed, added };
}

/**
 * Joins changes that sit close together into one, so a rewritten sentence reads
 * as the old one and then the new one, not as a scatter of single words around
 * the little words that happened to match.
 *
 * What it absorbs goes into both sides of the change, so the pieces still join
 * back into exactly either text. It does mean a joined change is one thing to
 * take or leave. A `tidy` piece counts as part of the stretch between, and is
 * absorbed with it if it comes to that: a rewritten sentence is still one thing
 * for having a diacritic restored in the middle of it.
 */
export function mergeCloseChanges(pieces: readonly TextPiece[]): TextPiece[] {
  const merged: TextPiece[] = [];

  for (const piece of pieces) {
    merged.push(piece);

    // Each join makes a bigger change, which may now be able to absorb what is
    // on its other side, so this goes on looking back until nothing more gives.
    for (;;) {
      const right = merged.at(-1);
      if (right?.kind !== 'change') break;

      let leftAt = merged.length - 2;
      while (leftAt >= 0 && merged[leftAt]?.kind !== 'change') leftAt -= 1;
      const left = merged[leftAt];
      if (left?.kind !== 'change' || leftAt === merged.length - 2) break;

      const between = stretchOf(merged.slice(leftAt + 1, -1));
      if (!isAbsorbed(between, left, right)) break;

      merged.splice(leftAt, merged.length - leftAt, {
        kind: 'change',
        removed: left.removed + between.removed + right.removed,
        added: left.added + between.added + right.added,
      });
    }
  }
  return merged;
}
