import { type DiffPiece, type DiffRun, LINE_BREAK, type WordPiece, runsOf } from '../notes/paragraph-diff.ts';
import { type DiffParagraph, type DiffPart, type TextPiece, paragraphsOf } from '../notes/text-diff.ts';
import { scrollShowing } from './change-in-view.ts';
import { beginningAndEnd } from './deleted-and-archived/text-snippet.ts';
import { createStepper } from './stepper.ts';

/** What a marked block calls itself, and which way round it is. */
export interface DiffTag {
  tag: string;
  why: string;
}

export interface DiffViewOptions {
  tags: Record<'added' | 'missing' | 'changed', DiffTag>;
  stepper: {
    previous: string;
    next: string;
    at: (at: number, total: number) => string;
  };
  /**
   * Which side's words read as the new wording inside a changed paragraph, the
   * other side's being struck through.
   *
   * It has to be said because blocks and words answer different questions. A
   * green block is what the first text has that the second lacks. Inside a
   * changed paragraph, green is whatever replaces the old wording — and when the
   * first text is the older one, that is the second text's words.
   */
  newWords: 'added' | 'missing';
  /**
   * Shorten `missing` paragraphs to their two ends.
   *
   * For a caller whose second text he can read by closing the view, where
   * printing it whole would bury what he came for under what he already has.
   */
  shortenMissing: boolean;
}

/** How much of a paragraph he can read elsewhere is worth repeating here. */
const REMINDER = 150;

function paragraphOf(text: string): HTMLParagraphElement {
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  return paragraph;
}

/** One paragraph shown once, with only the words that changed marked. */
function rewordedOf(words: readonly WordPiece[], newWords: DiffViewOptions['newWords']): HTMLParagraphElement {
  const paragraph = document.createElement('p');

  for (const word of words) {
    // A break he made inside the paragraph, drawn as one. A break only one
    // side has is drawn too: a line cannot be struck through.
    if (word.text === LINE_BREAK) {
      paragraph.append(document.createElement('br'));
      continue;
    }
    if (word.kind === 'same') {
      paragraph.append(`${word.text} `);
      continue;
    }
    const marked = document.createElement('span');
    marked.className = word.kind === newWords ? 'word-new' : 'word-gone';
    marked.textContent = word.text;
    paragraph.append(marked, ' ');
  }
  return paragraph;
}

/**
 * A paragraph with its middle dropped, and something in the gap that he cannot
 * have typed.
 *
 * Not an ellipsis: he uses those, and one of ours sitting in a paragraph of his
 * would read as his own trailing off rather than as the app having cut
 * something out. Three middle dots in the colour of the block instead, which
 * belong to nothing on his keyboard.
 */
function shortenedOf(text: string): HTMLParagraphElement {
  const { head, tail } = beginningAndEnd(text, REMINDER);
  const paragraph = paragraphOf(head);
  if (tail === null) return paragraph;

  const cut = document.createElement('span');
  cut.className = 'review-cut';
  cut.textContent = '···';

  paragraph.append(' ', cut, ` ${tail}`);
  return paragraph;
}

function paragraphFor(piece: DiffPiece, options: DiffViewOptions): HTMLParagraphElement {
  if (piece.kind === 'changed') return rewordedOf(piece.words, options.newWords);
  if (piece.kind === 'missing' && options.shortenMissing) return shortenedOf(piece.text);
  return paragraphOf(piece.text);
}

function tagFor({ tag, why }: DiffTag): HTMLElement {
  const label = document.createElement('span');
  label.className = 'review-tag';

  const reason = document.createElement('span');
  reason.className = 'review-tag-why';
  reason.textContent = why;

  label.append(`${tag} `, reason);
  return label;
}

/** One run of paragraphs, tagged once. */
function blockFor(run: DiffRun, options: DiffViewOptions): HTMLElement {
  if (run.kind === 'same') {
    const plain = document.createElement('div');
    plain.append(...run.pieces.map((piece) => paragraphOf(piece.text)));
    return plain;
  }

  const block = document.createElement('div');
  block.className = `review-run review-run-${run.kind}`;
  block.append(tagFor(options.tags[run.kind]), ...run.pieces.map((piece) => paragraphFor(piece, options)));
  return block;
}

function stepperOver(
  box: HTMLElement,
  marked: string,
  words: DiffViewOptions['stepper'],
  review?: { markCurrent: (change: HTMLElement, isCurrent: boolean) => void },
): HTMLElement {
  const changes = [...box.querySelectorAll<HTMLElement>(marked)];

  let showing = 0;
  const steps = createStepper(
    { previous: words.previous, next: words.next },
    { onPrevious: () => goTo(showing - 1), onNext: () => goTo(showing + 1) },
  );
  steps.root.classList.add('review-steps');
  // Held back until it is known whether there is anywhere to go, which needs
  // the panel laid out. Hidden is the safe state to start in.
  steps.root.hidden = true;

  function goTo(which: number): void {
    const was = changes[showing];
    if (was !== undefined) review?.markCurrent(was, false);

    showing = Math.max(0, Math.min(which, changes.length - 1));
    steps.showing(words.at(showing + 1, changes.length), {
      canGoBack: showing > 0,
      canGoOn: showing < changes.length - 1,
    });

    const change = changes[showing];
    if (change === undefined) return;
    review?.markCurrent(change, true);
    box.scrollTop = scrollShowing(
      { top: change.offsetTop - box.offsetTop, height: change.offsetHeight },
      { height: box.clientHeight, scrollable: box.scrollHeight - box.clientHeight },
    );
  }

  // After the view is in the document, or every measurement here is zero.
  queueMicrotask(() => {
    // A text short enough to read without scrolling has nothing to steer
    // through: he can see all of it, and a stepper over it is chrome. Unless he
    // is reviewing, where going through the changes one by one is the work, and
    // how much fits in the window has nothing to do with it.
    const worthShowing = review !== undefined ? changes.length > 1 : box.scrollHeight > box.clientHeight;
    if (changes.length === 0 || !worthShowing) return;
    steps.root.hidden = false;
    goTo(0);
  });
  return steps.root;
}

/**
 * Two texts read as one, with where they differ marked in place.
 *
 * Put it in the document in the same task it is made in: the stepper measures
 * itself in a microtask.
 */
export function createDiffView(pieces: readonly DiffPiece[], options: DiffViewOptions): HTMLElement {
  const text = document.createElement('div');
  text.className = 'review-text';
  text.append(...runsOf(pieces).map((run) => blockFor(run, options)));

  // The stepper floats over the box, so the box is what it is placed against.
  // Hung on the column instead, it lands on whatever lines are above the box —
  // and how many of those there are varies.
  const framed = document.createElement('div');
  framed.className = 'review-framed';
  framed.append(text, stepperOver(text, '.review-run', options.stepper));
  return framed;
}

/** The most characters a change can have and still be hard to see. */
const EASY_TO_MISS = 2;

/** What stands in for spacing, where spacing is all that changed. */
export interface SpacingSymbols {
  space: string;
  lineBreak: string;
}

/** The space bar, and the mark on his Enter key. */
const SPACING_SYMBOLS: SpacingSymbols = { space: '␣', lineBreak: '↵' };

const markClass = (kind: DiffPart['kind']): string => (kind === 'removed' ? 'diff-gone' : 'diff-new');

/**
 * Spaces and breaks made visible, where they are all that changed: a struck-out
 * space cannot be seen, and a paragraph split in two would otherwise be reported
 * as a change with nothing on the screen to show for it.
 *
 * A single added line break is kept as well as marked, because it is where the
 * text would now break. A blank line is not: that is already the gap between
 * this paragraph and the next. Removed ones are only marked, or the text would
 * break in a place neither version does.
 */
function spacingPart(kind: DiffPart['kind'], text: string, symbols: SpacingSymbols): (HTMLElement | string)[] {
  const part = document.createElement('span');
  part.className = `${markClass(kind)} diff-small diff-spacing`;
  part.textContent = text.replace(/\n+/g, symbols.lineBreak).replace(/[^\S\n]/g, symbols.space);

  const breaksHere = kind === 'added' && /^[^\n]*\n[^\n]*$/.test(text);
  return breaksHere ? [part, '\n'] : [part];
}

/**
 * The words of a part marked, and the spaces around them left plain.
 *
 * A space is part of what changed, and the pieces keep it. But a block that runs
 * on past the end of its word reads as a slip of the marker rather than as
 * information.
 */
function wordsPart(kind: DiffPart['kind'], text: string): (HTMLElement | string)[] {
  const words = text.trim();
  const start = text.indexOf(words);

  const part = document.createElement('span');
  part.className = markClass(kind);
  if (words.length <= EASY_TO_MISS) part.classList.add('diff-small');
  part.textContent = words;

  return [text.slice(0, start), part, text.slice(start + words.length)];
}

const markedPart = ({ kind, text }: DiffPart, symbols: SpacingSymbols): (HTMLElement | string)[] =>
  /\S/.test(text) ? wordsPart(kind, text) : spacingPart(kind, text, symbols);

/** Shows which change the stepper is on, among the others like it. */
function markCurrentChange(change: HTMLElement, isCurrent: boolean): void {
  change.classList.toggle('diff-current', isCurrent);
  change.closest('.diff-paragraph')?.classList.toggle('diff-paragraph-current', isCurrent);
}

/**
 * One paragraph, with what was removed and what replaced it held in one element.
 *
 * That element is what the stepper counts and what it outlines, so a replacement
 * is lit as one thing. The part of a change carried over from the paragraph above
 * stands alone, and is not counted again.
 */
function paragraphBlock({ parts, changed }: DiffParagraph, symbols: SpacingSymbols): HTMLElement {
  const block = document.createElement('div');
  block.className = changed ? 'diff-paragraph diff-paragraph-changed' : 'diff-paragraph';

  let open: HTMLElement | null = null;
  for (const part of parts) {
    if (part.kind === 'same') {
      block.append(part.text);
      open = null;
      continue;
    }
    if (part.opensChange) {
      open = document.createElement('span');
      open.className = 'diff-change';
      block.append(open);
    }
    (open ?? block).append(...markedPart(part, symbols));
  }
  return block;
}

/**
 * Two whole texts read as one, with each change marked where it falls and a bar
 * in the margin of each paragraph that has one.
 *
 * Put it in the document in the same task it is made in, as with
 * {@link createDiffView}.
 */
export function createTextDiffView(
  pieces: readonly TextPiece[],
  stepper: DiffViewOptions['stepper'],
  symbols: SpacingSymbols = SPACING_SYMBOLS,
): HTMLElement {
  const text = document.createElement('div');
  text.className = 'review-text';
  text.append(...paragraphsOf(pieces).map((paragraph) => paragraphBlock(paragraph, symbols)));

  const framed = document.createElement('div');
  framed.className = 'review-framed diff-framed';
  framed.append(text, stepperOver(text, '.diff-change', stepper, { markCurrent: markCurrentChange }));
  return framed;
}
