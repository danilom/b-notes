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
 *
 * `resolved`, `undone`, `proposed` and `letters` are what a review leaves on a piece: see
 * `text-review.ts`. A resolved change is one he has dealt with, and `undone` says
 * it went back to what was there.
 */
export type TextPiece =
  | { kind: 'same'; text: string }
  | {
      kind: 'change' | 'tidy';
      removed: string;
      added: string;
      resolved?: boolean;
      undone?: boolean;
      proposed?: string;
      letters?: readonly string[];
    };

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
export const withoutDiacritics = (text: string): string =>
  text.replaceAll('đ', 'd').replaceAll('Đ', 'D').normalize('NFD').replace(/\p{M}/gu, '');

/**
 * What a token is lined up by, which is looser than whether it changed.
 *
 * `kucu` and `kuću` are the same word in the same place, and so are a space and
 * two. Lined up as different things they push everything around them out of step,
 * and `staru kucu` against `novu kuću` comes back as `kucu` becoming `novu kuću`.
 * Whether they count as changed is decided afterwards.
 */
const linedUpBy = (token: string): string =>
  /\S/.test(token) ? withoutDiacritics(token).replace(/dj/gi, (digraph) => digraph.charAt(0)) : ' ';

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

/** The letters and digits of a text, which is what its wording is made of. */
const lettersOf = (text: string): string => text.normalize('NFC').replace(/[^\p{L}\p{N}]/gu, '');

/** Whether `now` is `was` with diacritics restored and nothing else: `dj` counts as `đ`, how he types it. */
function isWithDiacriticsRestored(was: string, now: string): boolean {
  let at = 0;
  for (const letter of now) {
    const before = was.charAt(at);
    if (letter !== before && withoutDiacritics(letter) !== before) return false;
    at += 1;
    if (letter !== before && 'đĐ'.includes(letter) && 'jJ'.includes(was.charAt(at) || '-')) at += 1;
  }
  return at === was.length;
}

/**
 * Whether a change only tidies: the wording is what it was.
 *
 * He drops his diacritics and his spacing and punctuation wander, so a
 * proofreader's reply is mostly this, and every one marked hides the few changes
 * of wording among them. So: any spacing, any punctuation, and a plain letter
 * gaining its diacritic. Not a letter losing one, nor `ć` becoming `č`, which may
 * be right or wrong but is a decision about the word.
 *
 * Not a paragraph split or joined either, which is his structure.
 */
function isTidying({ removed, added }: Pick<Change, 'removed' | 'added'>): boolean {
  if (BLANK_LINES.test(removed) !== BLANK_LINES.test(added)) return false;
  return isWithDiacriticsRestored(lettersOf(removed), lettersOf(added));
}

/**
 * The same pieces, with the changes nobody needs to read set apart as `tidy`.
 *
 * Some of those diacritics will be wrong, since `sto` and `što` are both words and
 * only the meaning says which. Nothing here can tell which ones from two texts, so
 * they are all treated alike, and each stays visible as a letter in colour.
 *
 * Spaces at the very start of a text stay in front of him: that is his first line,
 * where more spaces rank a text higher in his list.
 */
export const separateTidying = (pieces: readonly TextPiece[]): TextPiece[] =>
  pieces.map((piece, at) => {
    if (piece.kind !== 'change' || !isTidying(piece)) return piece;
    const isHisRanking = at === 0 && !/\S/.test(piece.removed + piece.added);
    return isHisRanking ? piece : { ...piece, kind: 'tidy' };
  });

/** A run of a tidied text, and whether it is what was put there. */
export interface TidiedLetters {
  text: string;
  changed: boolean;
}

/**
 * Which characters of tidied text were put there, one by one, so that he sees what
 * was done for him: one letter in a word, or one comma, and not the word replaced.
 * Spacing is never singled out, having nothing to show.
 */
export function tidiedLettersOf({ removed, added }: Pick<Change, 'removed' | 'added'>): TidiedLetters[] {
  const runs: TidiedLetters[] = [];
  const aligned = alignSequences([...removed.normalize('NFC')], [...added.normalize('NFC')]);

  for (const { kind, text } of aligned) {
    if (kind === 'onlyFrom') continue;
    const changed = kind === 'onlyTo' && /\S/.test(text);
    const open = runs.at(-1);
    if (open?.changed === changed) open.text += text;
    else runs.push({ text, changed });
  }
  return runs;
}

/** A run of text in one paragraph as drawn, and whose it is. */
export interface DiffPart {
  /** `tidied-away` holds no text: it says something was corrected at this spot and left nothing to show. */
  kind: 'same' | 'removed' | 'added' | 'resolved' | 'tidied' | 'tidied-away';
  text: string;
  /** The first part of a change, where a change is carried across paragraphs. */
  opensChange: boolean;
  /** What `tidied` or `tidied-away` text was before, so what was done there can be told. */
  was?: string;
  /** What was proposed for a `tidied` word, if he has since chosen letters. */
  proposed?: string;
  /** The letters he chose for a `tidied` word, slot by slot. */
  letters?: readonly string[];
  /** A `tidied` word's place among the tidied, which is how a choice of letter finds it. */
  tidyAt?: number;
}

export interface DiffParagraph {
  parts: DiffPart[];
  /** Whether anything in it differs, or the break that opens it does. */
  changed: boolean;
}

/** Whether a part earns its paragraph a mark in the margin. What he has resolved does not: that paragraph is done. */
const isMarkedChange = ({ kind }: DiffPart): boolean => kind === 'removed' || kind === 'added';

/**
 * The pieces laid out as paragraphs, for drawing: which ones get a mark in the
 * margin, and what is in each.
 *
 * For the screen only. Unlike the pieces, this does not keep his exact spacing:
 * a blank line becomes the gap between two paragraphs. What is `tidy` is drawn as
 * it would be, in no way marking the paragraph as changed. With `showTidied`,
 * what was put there comes as a part of its own, and what only went away leaves a
 * part with no text where it was, having nothing else left to show.
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
    open.changed ||= isMarkedChange(part);
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

  let tidyAt = 0;
  for (const piece of pieces) {
    if (piece.kind === 'same') {
      addSplit('same', piece.text, false);
      continue;
    }
    if (piece.kind === 'tidy') {
      const proposed = piece.proposed ?? piece.added;
      const at = tidyAt;
      tidyAt += 1;
      const putSomethingThere = tidiedLettersOf({ removed: piece.removed, added: proposed }).some((letters) => letters.changed);
      if (showTidied && putSomethingThere && !BLANK_LINES.test(proposed)) {
        addPart({
          kind: 'tidied',
          text: piece.added,
          was: piece.removed,
          ...(piece.proposed === undefined ? {} : { proposed }),
          ...(piece.letters === undefined ? {} : { letters: piece.letters }),
          tidyAt: at,
          opensChange: false,
        });
        continue;
      }
      if (showTidied) addPart({ kind: 'tidied-away', text: '', was: piece.removed, opensChange: false });
      addSplit('same', piece.added, false);
      continue;
    }
    const { removed, added } = piece;
    if (piece.resolved === true) {
      const text = piece.undone === true ? removed : added;
      if (/\S/.test(text)) {
        addSplit('resolved', text, true);
      } else {
        // A part with no text, or something with nothing left to show could not be
        // found again. What spacing there is goes on as what it is.
        addPart({ kind: 'resolved', text: '', opensChange: true });
        addSplit('same', text, false);
      }
      continue;
    }
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
  return paragraphs.filter((paragraph) => paragraph.parts.length > 0).flatMap(stanzasOf);
}

/** A line of nothing but stars, which is how he often parts his stanzas. */
const STAR_LINE = /^[ \t]*\*+[ \t]*\r?\n?$/;

/** A paragraph's parts, line by line. Only what is the same is cut: a change stays whole. */
function linesOf(parts: readonly DiffPart[]): DiffPart[][] {
  const lines: DiffPart[][] = [[]];
  for (const part of parts) {
    if (part.kind !== 'same') {
      lines.at(-1)?.push(part);
      continue;
    }
    for (const text of part.text.split(/(?<=\n)/)) {
      lines.at(-1)?.push({ ...part, text });
      if (text.endsWith('\n')) lines.push([]);
    }
  }
  return lines;
}

const isStarLine = (line: readonly DiffPart[]): boolean => STAR_LINE.test(line.map((part) => part.text).join(''));

/** The newline that ended a stanza's last line, which the gap to the next now stands for. */
function withoutLastNewline(parts: readonly DiffPart[]): DiffPart[] {
  const last = parts.at(-1);
  if (last?.kind !== 'same') return [...parts];
  const text = last.text.replace(/\r?\n$/, '');
  return text.length > 0 ? [...parts.slice(0, -1), { ...last, text }] : [...parts.slice(0, -1)];
}

const hasMarkedChange = (parts: readonly DiffPart[]): boolean => parts.some(isMarkedChange);

/**
 * A paragraph cut at its star lines, so that the frame and the bar in the margin
 * can say which stanza a change is in rather than wrapping a whole poem.
 *
 * Only where there are any: he does this some days and not others, and a text
 * without them is left as it is. A change of break that opened the paragraph goes
 * on marking the first stanza.
 */
function stanzasOf(paragraph: DiffParagraph): DiffParagraph[] {
  const lines = linesOf(paragraph.parts);
  if (!lines.some(isStarLine)) return [paragraph];

  const groups: DiffPart[][] = [[]];
  for (const line of lines) {
    if (isStarLine(line)) groups.push(line, []);
    else groups.at(-1)?.push(...line);
  }

  const stanzas = groups
    .map(withoutLastNewline)
    .filter((parts) => parts.length > 0)
    .map((parts): DiffParagraph => ({ parts, changed: hasMarkedChange(parts) }));

  const first = stanzas[0];
  if (first !== undefined && paragraph.changed && !hasMarkedChange(paragraph.parts)) first.changed = true;
  return stanzas;
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
 * Never across the end of a paragraph or stanza, whether it stands between the two
 * or is part of one of them: that could not be read as old sentence, then new
 * sentence. A plain line break is another matter, since in a poem there is one
 * every few words, and a stanza rewritten would otherwise come apart line by line.
 */
const ENDS_A_PARAGRAPH = /\n[ \t]*\r?\n|\n[ \t]*\*+[ \t]*(?:\r?\n|$)|^[ \t]*\*+[ \t]*\r?\n/;

const holdsParagraphEnd = ({ removed, added }: Pick<Change, 'removed' | 'added'>): boolean =>
  ENDS_A_PARAGRAPH.test(removed) || ENDS_A_PARAGRAPH.test(added);

const isAbsorbed = (between: Pick<Change, 'removed' | 'added'>, left: Change, right: Change): boolean =>
  !holdsParagraphEnd(between) &&
  !holdsParagraphEnd(left) &&
  !holdsParagraphEnd(right) &&
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

/** Punctuation or spacing only: no letter or digit put in or taken out. */
const isPunctuationOnly = ({ removed, added }: Pick<Change, 'removed' | 'added'>): boolean => !/[\p{L}\p{N}]/u.test(removed + added);

/** Nothing, or spaces on the same line: what can stand between a change and its own edge. */
const isOnlySpaces = (piece: TextPiece | undefined): piece is Extract<TextPiece, { kind: 'same' }> =>
  piece?.kind === 'same' && /^[ \t]*$/.test(piece.text);

/** The tidy piece on one side of a change at `at`, with the spaces between, if it touches it there. */
function touchingFix(pieces: readonly TextPiece[], at: number, step: -1 | 1): { fix: Change; spaces: string; reach: number } | null {
  const near = pieces[at + step];
  const spaces = isOnlySpaces(near) ? near.text : '';
  const reach = isOnlySpaces(near) ? 2 : 1;
  const fix = pieces[at + step * reach];
  if (fix?.kind !== 'tidy' || !isPunctuationOnly(fix) || holdsParagraphEnd(fix)) return null;
  return { fix, spaces, reach };
}

/**
 * A comma or a space put right at the very edge of a change, made part of it. Taken
 * apart, "tvrdio, onako kako je on to umio, da" losing all but "tvrdio da" came out
 * as a small fix for the comma and a change for the words: two marks and two things
 * to decide, for what he sees as one edit. A restored letter stays apart, being a
 * correction to a word of its own.
 */
function withEdgesFolded(pieces: readonly TextPiece[]): TextPiece[] {
  const folded = [...pieces];
  for (let at = 0; at < folded.length; at += 1) {
    const change = folded[at];
    if (change?.kind !== 'change') continue;
    const before = touchingFix(folded, at, -1);
    const after = touchingFix(folded, at, 1);
    let [removed, added] = [change.removed, change.added];
    if (before !== null) [removed, added] = [before.fix.removed + before.spaces + removed, before.fix.added + before.spaces + added];
    if (after !== null) [removed, added] = [removed + after.spaces + after.fix.removed, added + after.spaces + after.fix.added];
    const [from, to] = [at - (before?.reach ?? 0), at + (after?.reach ?? 0)];
    folded.splice(from, to - from + 1, { kind: 'change', removed, added });
    at = from;
  }
  return folded;
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

  for (const piece of withEdgesFolded(pieces)) {
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
