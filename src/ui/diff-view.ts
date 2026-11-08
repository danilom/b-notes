import { type DiffPiece, type DiffRun, LINE_BREAK, type WordPiece, runsOf } from '../notes/paragraph-diff.ts';
import {
  type DiffParagraph,
  type DiffPart,
  type TextPiece,
  paragraphsOf,
} from '../notes/text-diff.ts';
import { letterSegmentsOf } from '../notes/text-review.ts';
import { scrollShowing } from './change-in-view.ts';
import { type BecameCurrent, type DiffChangeBar, type DiffEditing, createDiffChangeBar } from './diff-change-bar.ts';
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
  review?: {
    markCurrent: (change: HTMLElement, isCurrent: boolean, how: BecameCurrent) => void;
    changeAt: (clicked: Element) => HTMLElement | null;
    key: SVGElement;
    /** Set where changes can be acted on: there is then always a current one, even the only one. */
    editing?: {
      startAt: number | undefined;
      /** A coloured letter was clicked, for its choices. */
      onLetter: (letter: HTMLElement) => void;
      /** Somewhere that is no change was clicked, which puts the bar away. */
      onNothing: () => void;
    };
  },
): HTMLElement {
  const changes = [...box.querySelectorAll<HTMLElement>(marked)];

  let showing = 0;
  const steps = createStepper(
    { previous: words.previous, next: words.next },
    { onPrevious: () => goTo(showing - 1), onNext: () => goTo(showing + 1) },
  );
  steps.root.classList.add('review-steps');
  if (review !== undefined) steps.root.prepend(review.key);
  // Held back until it is known whether there is anywhere to go, which needs
  // the panel laid out. Hidden is the safe state to start in.
  steps.root.hidden = true;

  function select(which: number, how: BecameCurrent): HTMLElement | undefined {
    const was = changes[showing];
    if (was !== undefined) review?.markCurrent(was, false, how);

    showing = Math.max(0, Math.min(which, changes.length - 1));
    steps.showing(words.at(showing + 1, changes.length), {
      canGoBack: showing > 0,
      canGoOn: showing < changes.length - 1,
    });

    const change = changes[showing];
    if (change !== undefined) review?.markCurrent(change, true, how);
    return change;
  }

  function goTo(which: number, how: BecameCurrent = 'stepped'): void {
    const change = select(which, how);
    if (change === undefined) return;
    box.scrollTop = scrollShowing(
      { top: change.offsetTop - box.offsetTop, height: change.offsetHeight },
      { height: box.clientHeight, scrollable: box.scrollHeight - box.clientHeight },
    );
  }

  /**
   * What was clicked on made current, without scrolling, since he is already looking
   * at it. A drag that selected some text was for that.
   */
  function selectClicked(event: MouseEvent): void {
    if (!(event.target instanceof Element) || getSelection()?.isCollapsed === false) return;
    const clicked = review?.changeAt(event.target);
    const which = clicked === null || clicked === undefined ? -1 : changes.indexOf(clicked);
    if (which >= 0) select(which, 'clicked');
  }

  /**
   * In a review: a change clicked opens its bar, a coloured letter its choices, and
   * anywhere else puts the bar away. Only the change itself counts, not the plain words
   * around it, or in a rewrite, where nearly every paragraph has one, there would be no
   * empty place left to click; except a paragraph whose only change is the break that
   * opens it, which has nothing else to click.
   */
  function actOnClick(event: MouseEvent, editing: NonNullable<NonNullable<typeof review>['editing']>): void {
    if (!(event.target instanceof Element) || getSelection()?.isCollapsed === false) return;
    if (event.target.closest('.diff-edit') !== null) return;
    const letter = event.target.closest<HTMLElement>('.diff-tidied-letter');
    if (letter !== null) {
      editing.onLetter(letter);
      return;
    }
    const paragraph = event.target.closest('.diff-paragraph');
    const isOnChange = event.target.closest(CHANGE_FRAGMENT) !== null;
    const isBreakOnly = paragraph?.classList.contains('diff-paragraph-changed') === true && paragraph.querySelector(CHANGE_FRAGMENT) === null;
    const clicked = isOnChange || isBreakOnly ? review?.changeAt(event.target) : null;
    const which = clicked === null || clicked === undefined ? -1 : changes.indexOf(clicked);
    if (which >= 0) select(which, 'clicked');
    else editing.onNothing();
  }

  // After the view is in the document, or every measurement here is zero.
  queueMicrotask(() => {
    const editing = review?.editing;
    if (editing !== undefined) {
      if (changes.length === 0) return;
      steps.root.hidden = changes.length < 2;
      box.addEventListener('click', (event) => actOnClick(event, editing));
      const { startAt } = editing;
      if (startAt === undefined) goTo(0, 'restored');
      else select(startAt, 'restored');
      return;
    }
    // A text short enough to read without scrolling has nothing to steer
    // through: he can see all of it, and a stepper over it is chrome. Unless he
    // is reviewing, where going through the changes one by one is the work, and
    // how much fits in the window has nothing to do with it.
    const worthShowing = review !== undefined ? changes.length > 1 : box.scrollHeight > box.clientHeight;
    if (changes.length === 0 || !worthShowing) return;
    steps.root.hidden = false;
    if (review !== undefined) box.addEventListener('click', selectClicked);
    goTo(0, 'restored');
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

/** The box a wording is drawn in, by whose it is, and struck through where it is not the one going in. */
function markClass({ kind, struck }: Pick<DiffPart, 'kind' | 'struck'>): string {
  const whose = kind === 'removed' ? 'diff-gone' : kind === 'own' ? 'diff-own' : 'diff-new';
  return struck === true ? `${whose} diff-struck` : whose;
}

/**
 * Spacing made visible, where it is a change he has to read: almost always a
 * paragraph split or joined, the mark on his Enter key. The rest is the spaces
 * that open his first line, which a struck-out space could not show.
 */
function spacingPart(drawn: DiffPart): HTMLElement {
  const part = document.createElement('span');
  part.className = `${markClass(drawn)} diff-small diff-spacing`;
  part.textContent = drawn.text.includes('\n') ? '↵' : drawn.text.replace(/\s/g, '␣');
  return part;
}

const isOnlySpacing = (part: DiffPart | undefined): boolean => part !== undefined && !/\S/.test(part.text);

/** The space a paragraph break took the place of, or the other way about: the break says it all. */
const isSpaceBesideBreak = (part: DiffPart, other: DiffPart | undefined): boolean =>
  isOnlySpacing(part) && !part.text.includes('\n') && isOnlySpacing(other) && (other?.text.includes('\n') ?? false);

/**
 * The words of a part marked, and the spaces around them left plain.
 *
 * A space is part of what changed, and the pieces keep it. But a block that runs
 * on past the end of its word reads as a slip of the marker rather than as
 * information.
 */
function wordsPart(drawn: DiffPart): (HTMLElement | string)[] {
  const { text } = drawn;
  const words = text.trim();
  const start = text.indexOf(words);

  const part = document.createElement('span');
  part.className = markClass(drawn);
  // A single character is the one size of change that is easy to miss.
  if ([...words].length === 1) part.classList.add('diff-small');
  part.textContent = words;

  return [text.slice(0, start), part, text.slice(start + words.length)].filter((node) => node !== '');
}

/**
 * Moves the spaces at either end of a change out of it, so that what marks the
 * change as current goes around its words. Spaces between what was removed and
 * what was added stay: those are inside it.
 */
function movingSpacesOutOf(change: HTMLElement): void {
  const { firstChild: first, lastChild: last } = change;
  if (first instanceof Text) change.before(first);
  if (last instanceof Text && last !== first) change.after(last);
}

/**
 * A change he has dealt with: just its text, in quiet colour. With none left, an
 * empty dotted box, so it can be found again; a single character, heavier, because
 * a lone green comma is otherwise lost.
 */
function resolvedPart(text: string): HTMLElement {
  const part = document.createElement('span');
  part.className = 'diff-resolved';
  part.textContent = text;
  if (text === '') part.classList.add('diff-resolved-empty');
  else if ([...text.trim()].length === 1) part.classList.add('diff-resolved-small');
  return part;
}

function markedPart(drawn: DiffPart): (HTMLElement | string)[] {
  if (drawn.kind === 'resolved') return [resolvedPart(drawn.text)];
  return /\S/.test(drawn.text) ? wordsPart(drawn) : [spacingPart(drawn)];
}

/**
 * A word as it would be, with only what was put right in colour. Each such letter
 * is a target of its own, carrying what else it could be, and turns green once he
 * has chosen for it, which is how the rest of a review shows what is dealt with.
 */
function tidiedPart({ text, was = '', proposed = text, tidyAt = 0, letters = [] }: DiffPart): (HTMLElement | string)[] {
  let slot = -1;
  return letterSegmentsOf(was, proposed).map((segment) => {
    if (segment.kind === 'fixed' && segment.put !== true) return segment.text;

    const part = document.createElement('span');
    part.className = 'diff-tidied';
    if (segment.kind === 'fixed') {
      part.textContent = segment.text;
      return part;
    }
    slot += 1;
    const chosen = letters[slot];
    part.classList.add('diff-tidied-letter');
    if (chosen !== undefined) part.classList.add('diff-tidied-chosen');
    part.textContent = chosen ?? segment.proposed;
    part.dataset['tidyAt'] = String(tidyAt);
    part.dataset['slot'] = String(slot);
    part.dataset['choices'] = JSON.stringify(segment.choices);
    return part;
  });
}

/** A proofreader's caret, where something was corrected and left nothing else to show. */
function correctionMark(was: string): HTMLElement {
  const mark = document.createElement('span');
  mark.className = 'diff-correction-mark';
  mark.textContent = '‸';
  mark.title = /\S/.test(was) ? 'Uklonjen znak' : 'Ispravljen razmak';
  return mark;
}

const CHANGE_FRAGMENT = '.diff-change, .diff-change-carried';

/** Every fragment of a change in reading order, in the view it belongs to. */
const allFragments = (inside: Element): HTMLElement[] => [
  ...(inside.closest('.review-text')?.querySelectorAll<HTMLElement>(CHANGE_FRAGMENT) ?? []),
];

/** A change and what it carries on into later paragraphs. */
function fragmentsOf(change: HTMLElement): HTMLElement[] {
  const all = allFragments(change);
  const fragments = [change];
  for (let at = all.indexOf(change) + 1; all[at]?.classList.contains('diff-change-carried'); at += 1) {
    const carried = all[at];
    if (carried !== undefined) fragments.push(carried);
  }
  return fragments;
}

/** The paragraphs a change is in, and the one after, if the break that opens it is what changed. */
function paragraphsOfChange(change: HTMLElement): Element[] {
  const paragraphs = fragmentsOf(change).flatMap((fragment) => fragment.closest('.diff-paragraph') ?? []);
  const next = paragraphs.at(-1)?.nextElementSibling;
  const opensWithBreak = next?.classList.contains('diff-paragraph-changed') && next.querySelector(CHANGE_FRAGMENT) === null;
  return opensWithBreak && next !== null && next !== undefined ? [...paragraphs, next] : paragraphs;
}

/** Shows which change the stepper is on, among the others like it, all of it. */
function markCurrentChange(change: HTMLElement, isCurrent: boolean): void {
  for (const fragment of fragmentsOf(change)) fragment.classList.toggle('diff-current', isCurrent);
  for (const paragraph of paragraphsOfChange(change)) paragraph.classList.toggle('diff-paragraph-current', isCurrent);
}

/**
 * The change something clicked on belongs to, or the first in the paragraph clicked
 * on. A fragment carried over from the paragraph above belongs to the change it
 * came from, and so does a paragraph marked only for the break that opens it.
 * Null for a paragraph with no change in it.
 */
function changeAt(clicked: Element): HTMLElement | null {
  const paragraph = clicked.closest('.diff-paragraph');
  if (paragraph === null) return null;

  const onChange = clicked.closest<HTMLElement>(CHANGE_FRAGMENT);
  // Not a paragraph that is all resolved: only what is resolved in it answers there.
  if (onChange === null && !paragraph.classList.contains('diff-paragraph-changed')) return null;

  const fragment = onChange ?? paragraph.querySelector<HTMLElement>(CHANGE_FRAGMENT);
  if (fragment?.classList.contains('diff-change')) return fragment;

  const isAtOrBefore = (other: HTMLElement): boolean =>
    other === fragment ||
    (other.compareDocumentPosition(fragment ?? paragraph) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  return allFragments(paragraph).findLast((other) => other.classList.contains('diff-change') && isAtOrBefore(other)) ?? null;
}

/**
 * A small picture of how the current change looks: the bar, the frame and the
 * dashed line under it. It ties the stepper's count to the thing it counts.
 *
 * Drawn here rather than taken from the app's icon set, which has no such thing,
 * because it has to look like this screen rather than like any other icon.
 */
function currentChangeKey(): SVGElement {
  const namespace = 'http://www.w3.org/2000/svg';
  const shapes: [string, Record<string, string>][] = [
    ['rect', { class: 'diff-current-key-page', x: '4', y: '5', width: '19', height: '14', stroke: 'currentColor', 'stroke-width': '1.2' }],
    ['rect', { x: '1', y: '4.4', width: '5', height: '15.2', fill: 'currentColor' }],
    ['path', { d: 'M8.5 15.5h12', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-dasharray': '3 1.5' }],
  ];

  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'diff-current-key');
  svg.setAttribute('aria-hidden', 'true');
  for (const [name, attributes] of shapes) {
    const shape = document.createElementNS(namespace, name);
    for (const [attribute, value] of Object.entries(attributes)) shape.setAttribute(attribute, value);
    svg.append(shape);
  }
  return svg;
}

/**
 * One paragraph, with what was removed and what replaced it held in one element.
 *
 * That element is what the stepper counts and what it outlines, so a replacement
 * is lit as one thing. The part of a change carried over from the paragraph above
 * stands alone, and is not counted again.
 */
function paragraphBlock({ parts, changed }: DiffParagraph): HTMLElement {
  const block = document.createElement('div');
  block.className = changed ? 'diff-paragraph diff-paragraph-changed' : 'diff-paragraph';

  let open: HTMLElement | null = null;
  for (const [at, part] of parts.entries()) {
    if (part.kind === 'same' || part.kind === 'tidied' || part.kind === 'tidied-away') {
      if (open !== null) movingSpacesOutOf(open);
      if (part.kind === 'same') block.append(part.text);
      else if (part.kind === 'tidied') block.append(...tidiedPart(part));
      else block.append(correctionMark(part.was ?? ''));
      open = null;
      continue;
    }
    if (part.opensChange || open === null) {
      if (open !== null) movingSpacesOutOf(open);
      open = document.createElement('span');
      open.className = part.opensChange ? 'diff-change' : 'diff-change-carried';
      block.append(open);
    }
    const other = part.kind === 'removed' ? parts[at + 1] : parts[at - 1];
    if (!isSpaceBesideBreak(part, other)) open.append(...markedPart(part));
  }
  if (open !== null) movingSpacesOutOf(open);
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
  { showTidied = false, editing }: { showTidied?: boolean; editing?: DiffEditing } = {},
): HTMLElement {
  const text = document.createElement('div');
  text.className = 'review-text';
  text.append(...paragraphsOf(pieces, { showTidied }).map(paragraphBlock));

  const framed = document.createElement('div');
  framed.className = 'review-framed diff-framed';

  const changes = [...text.querySelectorAll<HTMLElement>('.diff-change')];
  const bar: DiffChangeBar | null = editing === undefined ? null : createDiffChangeBar(framed, text, changes, editing);

  const markCurrent = (change: HTMLElement, isCurrent: boolean, how: BecameCurrent): void => {
    markCurrentChange(change, isCurrent);
    if (!isCurrent) return;
    bar?.setCurrent(change, how);
    editing?.onCurrent(changes.indexOf(change));
  };

  framed.prepend(
    text,
    stepperOver(text, '.diff-change', stepper, {
      markCurrent,
      changeAt,
      key: currentChangeKey(),
      ...(bar === null || editing === undefined
        ? {}
        : { editing: { startAt: editing.startAt, onLetter: (letter: HTMLElement) => bar.showLetter(letter), onNothing: () => bar.close() } }),
    }),
  );
  return framed;
}
