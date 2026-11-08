import type { ChangeCandidate } from '../notes/text-diff.ts';
import { icon } from './icons.ts';

/**
 * Whether the bar shows over the current change. `quiet` after he has decided one, until he
 * steps or clicks to a change: it is done, and the bar going is how he sees that. `closed` once
 * he has put it away, until he clicks a change: stepping then moves through the changes without it.
 */
export type BarState = 'shown' | 'quiet' | 'closed';

/** How a change came to be the current one, which decides whether its bar shows. */
export type BecameCurrent = 'restored' | 'stepped' | 'clicked';

/** Where a change stands: which wording goes in, whether all of them are showing, and which there are. */
export interface ChangeStanding {
  chosen: ChangeCandidate;
  isOpen: boolean;
  /** Whether there are old words to bring back, and proposed words to take; either may be nothing. */
  hasOld: boolean;
  hasProposed: boolean;
  hasOwn: boolean;
}

/** What the three choices are called on the bar. */
export interface ChoiceWords {
  old: string;
  proposed: string;
  own: string;
}

/** Said as what each does, which is how every other button he knows speaks. */
const CHOICE_WORDS: ChoiceWords = { old: 'Vrati staro', proposed: 'Prihvati', own: 'Izmeni' };

/** What the reviewer of a proposal can do to it, from the bar above each change. */
export interface DiffEditing {
  /** The change to start on, by its place among the changes. */
  startAt?: number;
  /** How the bar was left before this drawing of the view. */
  barStarts?: BarState;
  /** A change chosen just before this drawing, to be shown settling from the box of the wording chosen. */
  settling?: { at: number; from: ChangeCandidate };
  onBarState: (state: BarState) => void;
  choiceOf: (changeAt: number) => ChangeStanding;
  /** Picks the old text or the proposal, which collapses the change to it. */
  onChoose: (changeAt: number, chosen: 'old' | 'proposed') => void;
  /** Shows every wording of a collapsed change, choosing nothing. */
  onOpen: (changeAt: number) => void;
  /** The wording an edit of this change starts from. */
  wordingOf: (changeAt: number) => string;
  /** What the choices are called, where something other than the usual is being tried. */
  choiceWords?: ChoiceWords;
  onEdit: (changeAt: number, text: string) => void;
  /** Called when an edit is backed out of, so that what it disturbed can be drawn again. */
  onCancelEdit: () => void;
  /** Letters chosen so far for a tidied word, slot by slot. */
  lettersOf: (tidyAt: number) => readonly string[];
  onPickLetter: (tidyAt: number, slot: number, letter: string) => void;
  onCurrent: (changeAt: number) => void;
}

const GAP_ABOVE_PX = 3;

/**
 * How long to wait for the wordings not chosen to fade before the change is drawn
 * collapsed: the stylesheet's 180ms, and a little over, since the fade starts a frame or
 * two after the click and was cut off half done without it.
 */
const LEAVING_MS = 230;

export interface DiffChangeBar {
  /** The change now current, and how it got to be, which decides whether its bar shows. */
  setCurrent: (change: HTMLElement | null, how: BecameCurrent) => void;
  /** The choices for one coloured letter, over it, when he clicks it. */
  showLetter: (letter: HTMLElement) => void;
  /** Put away, as X does: a click on nothing in particular. */
  close: () => void;
  /**
   * His own wording clicked: edited, as Izmeni does, if the bar is up over its change.
   * Returns whether it was; otherwise the click is an ordinary one.
   */
  editOwn: (own: Element) => boolean;
}

/** On a change while the bar is up over it, which is when its own wording can be clicked to edit. */
const BAR_OVER = 'diff-bar-over';

function barButton(said: string, className: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = said;
  button.addEventListener('click', onClick);
  return button;
}

/** A change, however it continues: any fragment of it leads back to where it began. */
function changeOfFragment(fragment: Element, changes: readonly HTMLElement[], all: readonly Element[]): HTMLElement | null {
  for (let at = all.indexOf(fragment); at >= 0; at -= 1) {
    const candidate = all[at];
    if (candidate instanceof HTMLElement && candidate.classList.contains('diff-change') && changes.includes(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Where his typing goes. Collapsed, in place of the one wording showing. Open, where his
 * own wording stands, or after the others if he has none yet; and those others are struck
 * out meanwhile, since what he is typing is what will go in.
 */
function placeField(field: HTMLElement, change: HTMLElement, fragments: readonly Element[]): void {
  const inChange = (selector: string): Element[] => fragments.flatMap((fragment) => [...fragment.querySelectorAll(selector)]);
  const [shown, ...restShown] = [...inChange('.diff-resolved'), ...inChange('.diff-own')];
  for (const other of inChange('.diff-gone, .diff-new')) other.classList.add('diff-struck');

  if (shown !== undefined) {
    shown.replaceWith(field);
    for (const other of restShown) other.remove();
    return;
  }
  const last = inChange('.diff-gone, .diff-new').at(-1);
  if (last === undefined) change.append(field);
  else last.after(field);
}

/**
 * Turns the wording of a change into a place to type, right there in the sentence.
 * Enter confirms, and so does clicking anywhere else, so that what was typed is not
 * lost; Escape backs out. Shift+Enter makes a new line for whoever knows of it.
 */
function startEditing(change: HTMLElement, fragments: readonly Element[], at: number, editing: DiffEditing): void {
  const wording = editing.wordingOf(at);
  const words = wording.trim();
  const start = wording.indexOf(words);
  const [lead, trail] = [wording.slice(0, start), wording.slice(start + words.length)];

  const field = document.createElement('span');
  field.className = 'diff-edit';
  field.contentEditable = 'plaintext-only';
  field.spellcheck = false;
  field.textContent = words;

  placeField(field, change, fragments);

  let leaving: 'confirming' | 'backing out' | null = null;
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') leaving = 'backing out';
    else if (event.key === 'Enter' && !event.shiftKey) leaving = 'confirming';
    else return;
    event.preventDefault();
    event.stopPropagation();
    field.blur();
  });
  field.addEventListener('blur', () => {
    // The browser keeps one extra line break after a last line he ended with Shift+Enter.
    const typed = (field.textContent ?? '').replace(/\n$/, '');
    // Clicking away from something not changed is not a decision. Enter is.
    const isDecision = leaving === 'confirming' || (leaving === null && typed !== words);
    if (isDecision) editing.onEdit(at, lead + typed + trail);
    else editing.onCancelEdit();
  });

  // With the cursor at the end and nothing selected: this is for mending what is
  // there, and with it all selected the first key pressed would wipe it.
  field.focus();
  getSelection()?.selectAllChildren(field);
  getSelection()?.collapseToEnd();
}

/**
 * The small bar above a change: over the current one, when he clicks a change or steps
 * to one. Not on the pointer passing over: a hand resting on the text while he reads
 * raised bars over the line he was reading, and an unsteady one could not get to the
 * buttons before they went.
 *
 * One bar, floating over the box rather than inside it, so that it moves no lines
 * and is not cut off by the edge of the box.
 */
export function createDiffChangeBar(
  framed: HTMLElement,
  box: HTMLElement,
  changes: readonly HTMLElement[],
  editing: DiffEditing,
): DiffChangeBar {
  const bar = document.createElement('div');
  bar.className = 'stepper diff-bar';
  bar.hidden = true;
  framed.append(bar);

  let current: HTMLElement | null = null;
  let shownOver: Element | null = null;
  let isEditing = false;
  /** Between a choice and the drawing it leads to: a second click then would choose twice. */
  let isLeaving = false;
  /** Kept by the caller, across redraws. */
  let state: BarState = editing.barStarts ?? 'shown';

  const setState = (next: BarState): void => {
    state = next;
    editing.onBarState(next);
  };

  const fragmentsAll = (): Element[] => [...box.querySelectorAll('.diff-change, .diff-change-carried')];

  function fragmentsOf(change: HTMLElement): Element[] {
    const all = fragmentsAll();
    const found: Element[] = [change];
    for (let at = all.indexOf(change) + 1; all[at]?.classList.contains('diff-change-carried'); at += 1) {
      const carried = all[at];
      if (carried !== undefined) found.push(carried);
    }
    return found;
  }

  /**
   * Three choices, one of which is always in effect, as on a radio: the dot says which, for
   * when he comes back to a change. Each wears the colour of the wording it is for.
   */
  function choiceButton(said: string, className: string, isChosen: boolean, onClick: () => void): HTMLButtonElement {
    const button = barButton(said, `${className} diff-bar-choice`, onClick);
    const dot = document.createElement('span');
    dot.className = 'diff-bar-dot';
    dot.setAttribute('aria-hidden', 'true');
    button.prepend(dot);
    button.setAttribute('aria-pressed', String(isChosen));
    if (isChosen) button.classList.add('diff-bar-chosen');
    return button;
  }

  function fillForChange(change: HTMLElement): void {
    const at = changes.indexOf(change);
    const words = editing.choiceWords ?? CHOICE_WORDS;
    const { chosen, hasOld, hasProposed } = editing.choiceOf(at);
    // The side that is nothing says so, in the sign he writes it with.
    const nothing = (has: boolean): string => (has ? '' : ' (∅)');
    bar.replaceChildren(
      choiceButton(words.old + nothing(hasOld), 'diff-bar-old', chosen === 'old', () => choose(change, 'old')),
      choiceButton(words.proposed + nothing(hasProposed), 'diff-bar-new', chosen === 'proposed', () => choose(change, 'proposed')),
      withPencil(choiceButton(words.own, 'diff-bar-own', chosen === 'own', () => beginEditing(change))),
      closeButton(),
    );
  }

  /**
   * The bar goes at once, the wordings not chosen fade, and then the change is drawn
   * collapsed, where what was chosen settles from its box into the colour of what goes
   * in. Straight to the choice where he has asked his computer for less movement.
   */
  function choose(change: HTMLElement, chosen: 'old' | 'proposed'): void {
    if (isLeaving) return;
    const at = changes.indexOf(change);
    hide();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      editing.onChoose(at, chosen);
      return;
    }
    isLeaving = true;
    const kept = chosen === 'old' ? '.diff-gone' : '.diff-new';
    const wordings = fragmentsOf(change).flatMap((fragment) => [...fragment.querySelectorAll('.diff-gone, .diff-new, .diff-own')]);
    for (const wording of wordings) if (!wording.matches(kept)) wording.classList.add('diff-leaving');
    setTimeout(() => editing.onChoose(at, chosen), LEAVING_MS);
  }

  /** The one choice that also opens something to type in, and says so. */
  function withPencil(button: HTMLButtonElement): HTMLButtonElement {
    const pencil = icon('edit');
    pencil.classList.add('diff-bar-pencil');
    button.append(pencil);
    return button;
  }

  function beginEditing(change: HTMLElement): void {
    isEditing = true;
    hide();
    startEditing(change, fragmentsOf(change), changes.indexOf(change), editing);
  }

  /**
   * Out of the way, for reading what it was covering, until he clicks a change. Stepping
   * meanwhile moves the frame and not the bar. The change stays current.
   */
  function putAway(): void {
    if (isEditing) return;
    setState('closed');
    hide();
  }

  function closeButton(): HTMLButtonElement {
    const close = barButton('', 'stepper-close', putAway);
    close.title = 'Zatvori';
    close.setAttribute('aria-label', 'Zatvori');
    close.append(icon('close'));
    return close;
  }

  function fillForLetter(letter: HTMLElement): void {
    const [tidyAt, slot] = [Number(letter.dataset['tidyAt']), Number(letter.dataset['slot'])];
    const choices: unknown = JSON.parse(letter.dataset['choices'] ?? '[]');
    if (!Array.isArray(choices)) return;

    bar.replaceChildren(
      ...choices.flatMap((choice: unknown) => {
        if (typeof choice !== 'string') return [];
        const isShowing = choice === letter.textContent;
        return [
          barButton(choice, isShowing ? 'diff-bar-letter diff-bar-letter-chosen' : 'diff-bar-letter', () =>
            editing.onPickLetter(tidyAt, slot, choice),
          ),
        ];
      }),
    );
  }

  /** Above the start of what it is for, and gone if that has scrolled out of the box. */
  function place(over: Element): void {
    const line = over.getClientRects()[0];
    const [frame, visible] = [framed.getBoundingClientRect(), box.getBoundingClientRect()];
    if (line === undefined || line.bottom < visible.top || line.top > visible.bottom) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    // Over a single letter, centred on it: the pointer is right there, and has the
    // shortest way to go whichever letter it wants. A change is read from its start.
    const isLetter = over.classList.contains('diff-tidied-letter');
    const wanted = isLetter ? (line.left + line.right) / 2 - bar.offsetWidth / 2 : line.left;
    const left = Math.max(0, Math.min(wanted - frame.left, frame.width - bar.offsetWidth));
    const top = line.top - frame.top - bar.offsetHeight - GAP_ABOVE_PX;
    const clear = clearOfStepper(left, top, line.bottom - frame.top + GAP_ABOVE_PX);
    bar.style.left = `${clear.left}px`;
    bar.style.top = `${clear.top}px`;
  }

  /**
   * Keeps the bar off the box's own stepper, which is on top of the text in the corner:
   * to its left if there is room, or else under the line it is for.
   */
  function clearOfStepper(left: number, top: number, topBelow: number): { left: number; top: number } {
    const steps = framed.querySelector('.review-steps');
    if (!(steps instanceof HTMLElement) || steps.hidden) return { left, top };
    const [frame, taken] = [framed.getBoundingClientRect(), steps.getBoundingClientRect()];
    const [takenLeft, takenTop, takenBottom] = [taken.left - frame.left, taken.top - frame.top, taken.bottom - frame.top];
    const meets = left + bar.offsetWidth > takenLeft - GAP_ABOVE_PX && top + bar.offsetHeight > takenTop - GAP_ABOVE_PX && top < takenBottom + GAP_ABOVE_PX;
    if (!meets) return { left, top };
    const moved = takenLeft - bar.offsetWidth - GAP_ABOVE_PX;
    return moved >= 0 ? { left: moved, top } : { left, top: topBelow };
  }

  function showOver(over: Element): void {
    if (isEditing) return;
    shownOver = over;
    for (const marked of box.querySelectorAll(`.${BAR_OVER}`)) marked.classList.remove(BAR_OVER);
    if (over.classList.contains('diff-tidied-letter') && over instanceof HTMLElement) {
      fillForLetter(over);
    } else {
      const change = changeOfFragment(over, changes, fragmentsAll());
      if (change === null) return;
      fillForChange(change);
      for (const fragment of fragmentsOf(change)) fragment.classList.add(BAR_OVER);
    }
    place(over);
  }

  function hide(): void {
    bar.hidden = true;
    shownOver = null;
    for (const marked of box.querySelectorAll(`.${BAR_OVER}`)) marked.classList.remove(BAR_OVER);
  }

  /**
   * Over the current change while it is open, unless he has put the bar away or has just
   * chosen. Never over a collapsed one, stepped to or not: its wordings are not showing,
   * and the choices would be about something he cannot see. A click opens it, bar and all.
   */
  const showCurrent = (): void => {
    const isOpen = current !== null && editing.choiceOf(changes.indexOf(current)).isOpen;
    if (current === null || !isOpen || isEditing || state !== 'shown') hide();
    else showOver(current);
  };

  const placeAgain = (): void => {
    if (shownOver !== null) place(shownOver);
  };
  box.addEventListener('scroll', placeAgain);
  // The first bar is placed as the review opens, before its lines and the stepper have
  // settled, and came out under the title instead of over it; and a window resized moves
  // every line. Placed again once they have.
  new ResizeObserver(placeAgain).observe(box);
  requestAnimationFrame(() => requestAnimationFrame(placeAgain));

  return {
    setCurrent(change, how) {
      current = change;
      // A collapsed change clicked opens, which draws the view again with this one current.
      const at = change === null ? -1 : changes.indexOf(change);
      if (how === 'clicked' && at >= 0 && !editing.choiceOf(at).isOpen) {
        editing.onOpen(at);
        return;
      }
      // Clicking a change always shows its bar; stepping does unless he put it away; a redraw keeps what was.
      if (how === 'clicked' || (how === 'stepped' && state === 'quiet')) setState('shown');
      showCurrent();
    },
    showLetter(letter) {
      if (isEditing) return;
      showOver(letter);
    },
    close: putAway,
    editOwn(own) {
      const fragment = own.closest(`.${BAR_OVER}`);
      if (fragment === null || isEditing || current === null) return false;
      if (changeOfFragment(fragment, changes, fragmentsAll()) !== current) return false;
      beginEditing(current);
      return true;
    },
  };
}
