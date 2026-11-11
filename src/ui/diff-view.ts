import {
  type ChangeCandidate,
  type DiffParagraph,
  type DiffPart,
  type TextPiece,
  paragraphsOf,
} from '../notes/text-diff.ts';
import { letterSegmentsOf } from '../notes/text-review.ts';
import { scrollShowing } from './change-in-view.ts';
import { MOVED_SPACE, copyOnlyWhatGoesIn } from './diff-copied-text.ts';
import {
  type BecameCurrent,
  type DiffChangeBar,
  type DiffEditing,
  type ScreenPoint,
  createDiffChangeBar,
} from './diff-change-bar.ts';
import { createStepper } from './stepper.ts';

/** What the stepper over a comparison says. */
export interface StepperWords {
  previous: string;
  next: string;
  at: (at: number, total: number) => string;
}

function stepperOver(
  box: HTMLElement,
  marked: string,
  words: StepperWords,
  review: {
    markCurrent: (change: HTMLElement, isCurrent: boolean, how: BecameCurrent) => void;
    changeAt: (clicked: Element) => HTMLElement | null;
    /** Set where changes can be acted on: there is then always a current one, even the only one. */
    editing?: {
      startAt: number | undefined;
      /** A coloured letter was clicked, for its choices. */
      onLetter: (letter: HTMLElement) => void;
      /** Somewhere that is no change was clicked, which puts the bar away. */
      onNothing: () => void;
      /** His own wording was clicked; true if that began an edit of it. */
      onOwn: (own: Element) => boolean;
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
  // Held back until it is known whether there is anywhere to go, which needs
  // the panel laid out. Hidden is the safe state to start in.
  steps.root.hidden = true;

  function select(which: number, how: BecameCurrent): HTMLElement | undefined {
    const was = changes[showing];
    if (was !== undefined) review.markCurrent(was, false, how);

    showing = Math.max(0, Math.min(which, changes.length - 1));
    steps.showing(words.at(showing + 1, changes.length), {
      canGoBack: showing > 0,
      canGoOn: showing < changes.length - 1,
    });

    const change = changes[showing];
    if (change !== undefined) review.markCurrent(change, true, how);
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
    const clicked = review.changeAt(event.target);
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
  function actOnClick(event: MouseEvent, editing: NonNullable<(typeof review)['editing']>): void {
    if (!(event.target instanceof Element) || getSelection()?.isCollapsed === false) return;
    if (event.target.closest('.diff-edit') !== null) return;
    // With the bar up over it, his own wording clicked is his to type over, as Izmeni does.
    const own = event.target.closest('.diff-own');
    if (own !== null && editing.onOwn(own)) return;
    const letter = event.target.closest<HTMLElement>('.diff-tidied-letter');
    if (letter !== null) {
      editing.onLetter(letter);
      return;
    }
    const paragraph = event.target.closest('.diff-paragraph');
    const isOnChange = event.target.closest(CHANGE_FRAGMENT) !== null;
    const isBreakOnly = paragraph?.classList.contains('diff-paragraph-changed') === true && paragraph.querySelector(CHANGE_FRAGMENT) === null;
    const clicked = isOnChange || isBreakOnly ? review.changeAt(event.target) : null;
    const which = clicked === null || clicked === undefined ? -1 : changes.indexOf(clicked);
    if (which >= 0) select(which, 'clicked');
    else editing.onNothing();
  }

  // After the view is in the document, or every measurement here is zero. There is always
  // a current change, even the only one, so that the arrow says where it is; the stepper
  // only once there is somewhere to step to.
  queueMicrotask(() => {
    if (changes.length === 0) return;
    steps.root.hidden = changes.length < 2;
    const { editing } = review;
    if (editing === undefined) {
      // Only reading: a text short enough to see whole has nothing to steer through,
      // and a stepper over it is chrome. Reviewing, going through the changes one by one
      // is the work, and how much fits in the window has nothing to do with it.
      if (box.scrollHeight <= box.clientHeight) steps.root.hidden = true;
      box.addEventListener('click', selectClicked);
      goTo(0, 'restored');
      return;
    }
    box.addEventListener('click', (event) => actOnClick(event, editing));
    if (editing.startAt === undefined) goTo(0, 'restored');
    else select(editing.startAt, 'restored');
  });
  return steps.root;
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
 * A change's own space, drawn outside it: marked, as copying takes the change's whole wording,
 * this space and all, and must not take it twice.
 */
function movedSpace(space: Text): HTMLElement {
  const marked = document.createElement('span');
  marked.className = MOVED_SPACE;
  marked.append(space);
  return marked;
}

/**
 * Moves the spaces at either end of a change out of it, so that what marks the
 * change as current goes around its words, and drops those between one wording and
 * the next. Each wording keeps the spaces at its own ends, which put next to each
 * other made one gap wider than another; the boxes have their own gap.
 */
function movingSpacesOutOf(change: HTMLElement): void {
  const { firstChild: first, lastChild: last } = change;
  if (first instanceof Text) change.before(movedSpace(first));
  if (last instanceof Text && last !== first) change.after(movedSpace(last));
  for (const node of [...change.childNodes]) {
    if (node instanceof Text && node.previousSibling instanceof HTMLElement && node.nextSibling instanceof HTMLElement) node.remove();
  }
}

/**
 * A change collapsed to the wording chosen: just its text, in quiet colour, with the
 * spaces at its ends left outside, as an open one's are, so that what marks it as
 * current stops at its last letter. With no text, the drawn ∅, so it can be found
 * again; a single character, heavier, because a lone green comma is otherwise lost.
 */
function resolvedPart(text: string): (HTMLElement | string)[] {
  const part = document.createElement('span');
  part.className = 'diff-resolved';
  if (text === '') {
    part.classList.add('diff-resolved-empty');
    return [part];
  }
  const words = text.trim();
  const start = text.indexOf(words);
  part.textContent = words;
  if ([...words].length === 1) part.classList.add('diff-resolved-small');
  return [text.slice(0, start), part, text.slice(start + words.length)].filter((node) => node !== '');
}

function markedPart(drawn: DiffPart): (HTMLElement | string)[] {
  if (drawn.kind === 'resolved') return resolvedPart(drawn.text);
  return /\S/.test(drawn.text) ? wordsPart(drawn) : [spacingPart(drawn)];
}

/**
 * A word as it would be, with only what was put right in colour. Each such letter
 * is a target of its own, carrying what else it could be, and turns green once he
 * has chosen for it, which is how the rest of a review shows what is dealt with.
 */
function tidiedPart({ text, was = '', proposed = text, tidyAt = 0, letters = [] }: DiffPart): (HTMLElement | string)[] {
  let slot = -1;
  const segments = letterSegmentsOf(was, proposed);
  const parts = segments.map((segment) => {
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
  markCloseLetters(parts);
  return parts;
}

/**
 * Marks corrected letters with another within one character of them, as in šč or
 * šiša, on the side it is on. A letter's target is wider than the letter, and two
 * that close would grow into each other, so that side keeps to the letter.
 */
function markCloseLetters(parts: readonly (HTMLElement | string)[]): void {
  let previous: HTMLElement | null = null;
  let between = 0;
  for (const part of parts) {
    if (!(part instanceof HTMLElement && part.classList.contains('diff-tidied-letter'))) {
      between += [...(typeof part === 'string' ? part : (part.textContent ?? ''))].length;
      continue;
    }
    if (previous !== null && between <= 1) {
      previous.classList.add('diff-letter-close-after');
      part.classList.add('diff-letter-close-before');
    }
    previous = part;
    between = 0;
  }
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
 * The change just chosen, on every fragment of it, with which wording it went in as: it
 * starts in that wording's box and settles into the colour of what goes in.
 */
function markSettling(framed: HTMLElement, changes: readonly HTMLElement[], settling: DiffEditing['settling']): void {
  const change = settling === undefined ? undefined : changes[settling.at];
  if (change === undefined || settling === undefined) return;
  const { startedAt, from } = settling;
  if (startedAt === undefined) {
    for (const fragment of fragmentsOf(change)) fragment.classList.add('diff-settling');
    return;
  }
  // Once the view is in the document and scrolled back to where he was, which is a task away.
  requestAnimationFrame(() => crossFadeFrom(framed, change, from, startedAt));
}

/** The box each wording is drawn in, open. */
const BOX_OF: Record<ChangeCandidate, string> = { old: 'diff-gone', proposed: 'diff-new', own: 'diff-own' };

/** The whole of a choice settling: the box gliding to where the words land, then giving way to them. */
const SETTLE_MS = 650;
/** How much of that is the glide, before the box starts to give way. */
const GLIDE_SHARE = 0.55;

/**
 * The box he chose, drawn again as it was, glides from where it stood to where its words
 * now are, and then fades as they appear in the green of what goes in, so that each frame
 * is the one or the other, or both: never a half-way colour, nor a weight or a padding
 * changing in a jump. Only words on one line, which a box can be drawn round; the rest
 * simply appear.
 */
function crossFadeFrom(framed: HTMLElement, change: HTMLElement, from: ChangeCandidate, startedAt: ScreenPoint): void {
  const words = change.querySelector<HTMLElement>('.diff-resolved');
  if (words === null || !words.isConnected) return;
  const lines = words.getClientRects();
  const landed = lines[0];
  if (lines.length !== 1 || landed === undefined) {
    for (const fragment of fragmentsOf(change)) fragment.classList.add('diff-settling');
    return;
  }

  const box = document.createElement('span');
  box.className = `${BOX_OF[from]} diff-settling-box`;
  box.textContent = words.textContent;
  box.style.font = getComputedStyle(words).font;
  box.style.fontWeight = 'normal';
  framed.append(box);

  const [frame, padding] = [framed.getBoundingClientRect(), getComputedStyle(box)];
  const landedLeft = landed.left - parseFloat(padding.paddingLeft) - frame.left;
  const landedTop = landed.top - parseFloat(padding.paddingTop) - frame.top;
  box.style.left = `${landedLeft}px`;
  box.style.top = `${landedTop}px`;
  const shift = `translate(${startedAt.left - frame.left - landedLeft}px, ${startedAt.top - frame.top - landedTop}px)`;

  const timing = { duration: SETTLE_MS, easing: 'ease-out' };
  // Held at its last frame: the box is taken away a moment after the end, and came back
  // whole for that moment without it, a flash.
  const leaving = box.animate(
    [{ transform: shift, opacity: 1 }, { transform: 'none', opacity: 1, offset: GLIDE_SHARE }, { transform: 'none', opacity: 0 }],
    { ...timing, fill: 'forwards' },
  );
  words.animate([{ opacity: 0 }, { opacity: 0, offset: GLIDE_SHARE }, { opacity: 1 }], timing);
  const gone = (): void => box.remove();
  leaving.addEventListener('finish', gone);
  leaving.addEventListener('cancel', gone);
}

/** What is highlighted in a change: its boxes, or its text once collapsed. Not the room below for its dotted line. */
const HIGHLIGHTED = '.diff-new, .diff-gone, .diff-own, .diff-resolved, .diff-edit';

/** The first line the current change is on, as the top and bottom of what is highlighted on it. */
function firstLineOfCurrent(box: HTMLElement): { top: number; bottom: number } | null {
  const pieces = [...box.querySelectorAll('.diff-current')]
    .flatMap((fragment) => [...fragment.querySelectorAll(HIGHLIGHTED)])
    .flatMap((piece) => [...piece.getClientRects()])
    .filter((piece) => piece.height > 0)
    .sort((one, other) => one.top - other.top);
  const [first] = pieces;
  if (first === undefined) return null;
  // Pieces side by side on that line are one line, whatever their heights.
  const onIt = pieces.filter((piece) => piece.top < first.bottom);
  return { top: Math.min(...onIt.map((piece) => piece.top)), bottom: Math.max(...onIt.map((piece) => piece.bottom)) };
}

/**
 * The arrow in the margin, moved beside the first line of the current change: in the
 * box that scrolls, measured from its corner, so that it scrolls with the text.
 */
function placeCurrentMark(box: HTMLElement, mark: HTMLElement): void {
  const line = firstLineOfCurrent(box);
  const paragraph = box.querySelector('.diff-paragraph');
  mark.hidden = line === null || paragraph === null;
  if (line === null || paragraph === null) return;
  const frame = box.getBoundingClientRect();
  const [left, top] = [frame.left + box.clientLeft, frame.top + box.clientTop];
  mark.style.left = `${paragraph.getBoundingClientRect().left - left + box.scrollLeft}px`;
  mark.style.top = `${(line.top + line.bottom) / 2 - top + box.scrollTop}px`;
}

/**
 * Two whole texts read as one, with each change marked where it falls, and an arrow
 * in the margin beside the current one.
 *
 * Put it in the document in the same task it is made in: the stepper measures itself,
 * and makes the first change current, in a microtask.
 *
 * Without `editing` it only shows, as Ranije verzije does: no bar and nothing chosen, and
 * a click only makes a change current.
 */
export function createTextDiffView(
  pieces: readonly TextPiece[],
  stepper: StepperWords,
  { showTidied = false, editing }: { showTidied?: boolean; editing?: DiffEditing } = {},
): HTMLElement {
  const text = document.createElement('div');
  text.className = 'review-text';
  text.append(...paragraphsOf(pieces, { showTidied }).map(paragraphBlock));

  // First, so that the last child is still a paragraph, whose bottom margin is taken off.
  const mark = document.createElement('div');
  mark.className = 'diff-current-mark';
  mark.hidden = true;
  text.prepend(mark);
  // A window resized moves every line, the arrow's with them.
  new ResizeObserver(() => placeCurrentMark(text, mark)).observe(text);

  const framed = document.createElement('div');
  framed.className = 'review-framed diff-framed';

  const changes = [...text.querySelectorAll<HTMLElement>('.diff-change')];
  markSettling(framed, changes, editing?.settling);
  // Reviewing, he may copy a piece of what he is about to take; only reading, as in Ranije verzije, it is left as it was.
  if (editing !== undefined) {
    copyOnlyWhatGoesIn(text, (change) => editing.wordingOf(changes.findIndex((each) => each === change)), editing.textNow);
  }
  const bar: DiffChangeBar | null = editing === undefined ? null : createDiffChangeBar(framed, text, changes, editing, () => placeCurrentMark(text, mark));

  const markCurrent = (change: HTMLElement, isCurrent: boolean, how: BecameCurrent): void => {
    markCurrentChange(change, isCurrent);
    if (!isCurrent) return;
    placeCurrentMark(text, mark);
    bar?.setCurrent(change, how);
    editing?.onCurrent(changes.indexOf(change));
  };

  framed.prepend(
    text,
    stepperOver(text, '.diff-change', stepper, {
      markCurrent,
      changeAt,
      ...(bar === null || editing === undefined
        ? {}
        : {
            editing: {
              startAt: editing.startAt,
              onLetter: (letter: HTMLElement) => bar.showLetter(letter),
              onNothing: () => bar.close(),
              onOwn: (own: Element) => bar.editOwn(own),
            },
          }),
    }),
  );
  return framed;
}
