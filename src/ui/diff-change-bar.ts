import { icon } from './icons.ts';

/** What the reviewer of a proposal can do to it, from the bar above each change. */
export interface DiffEditing {
  /** The change to start on, by its place among the changes. */
  startAt?: number;
  /** Whether the bar over that change was closed before this drawing of it. */
  startsClosed?: boolean;
  onBarClosed: (closed: boolean) => void;
  isResolved: (changeAt: number) => boolean;
  /** The wording an edit of this change starts from: whatever it is now showing. */
  wordingOf: (changeAt: number) => string;
  onUndo: (changeAt: number) => void;
  onAccept: (changeAt: number) => void;
  /** Back to the proposal, red and green, from where any of it can be chosen again. */
  onReopen: (changeAt: number) => void;
  onEdit: (changeAt: number, text: string) => void;
  /** Called when an edit is backed out of, so that what it disturbed can be drawn again. */
  onCancelEdit: () => void;
  /** Letters chosen so far for a tidied word, slot by slot. */
  lettersOf: (tidyAt: number) => readonly string[];
  onPickLetter: (tidyAt: number, slot: number, letter: string) => void;
  onCurrent: (changeAt: number) => void;
}

/** Long enough that a pointer passing over on its way somewhere raises nothing. */
const SHOW_AFTER_MS = 100;
/** Long enough for an unsteady hand to get from the word up to the button. */
const HIDE_AFTER_MS = 500;
const GAP_ABOVE_PX = 3;

const HOVERABLE = '.diff-change, .diff-change-carried, .diff-tidied-letter';

export interface DiffChangeBar {
  /** The change whose bar shows when the pointer is over no other. */
  setCurrent: (change: HTMLElement | null) => void;
}

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

  const place = fragments.flatMap((fragment) => [...fragment.querySelectorAll('.diff-new, .diff-resolved')]);
  const [first, ...rest] = place;
  if (first === undefined) change.append(field);
  else first.replaceWith(field);
  for (const other of rest) other.remove();

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
 * The small bar above a change: over whichever the pointer is on, and otherwise
 * over the current one. Nothing has to be clicked or stepped to first.
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
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let isEditing = false;
  /** Whether he closed the bar over the current change. Kept by the caller, across redraws. */
  let isOutOfTheWay = editing.startsClosed === true;

  const setOutOfTheWay = (closed: boolean): void => {
    isOutOfTheWay = closed;
    editing.onBarClosed(closed);
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

  function fillForChange(change: HTMLElement): void {
    const at = changes.indexOf(change);
    const edit = barButton('Izmeni', 'diff-bar-edit', () => {
      isEditing = true;
      hide();
      startEditing(change, fragmentsOf(change), at, editing);
    });

    if (editing.isResolved(at)) {
      // Plain, unlike the choices: this is a step back, and not one more decision.
      const reopen = barButton('Vrati predlog', 'diff-bar-reopen', () => editing.onReopen(at));
      reopen.prepend(icon('undo'));
      bar.replaceChildren(edit, reopen, closeButton());
      return;
    }
    bar.replaceChildren(
      barButton('Vrati staro', 'diff-bar-old', () => editing.onUndo(at)),
      barButton('Prihvati', 'diff-bar-new', () => editing.onAccept(at)),
      edit,
      closeButton(),
    );
  }

  /**
   * Out of the way, for reading the line it was covering. Until the pointer goes back
   * onto that change, or he steps or clicks to one; passing over anything else on the
   * way does not bring it back. The change stays current meanwhile.
   */
  function closeButton(): HTMLButtonElement {
    const close = barButton('', 'stepper-close', () => {
      cancelTimers();
      setOutOfTheWay(true);
      hide();
    });
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
    const left = Math.min(wanted - frame.left, frame.width - bar.offsetWidth);
    bar.style.left = `${Math.max(0, left)}px`;
    bar.style.top = `${line.top - frame.top - bar.offsetHeight - GAP_ABOVE_PX}px`;
  }

  function showOver(over: Element): void {
    if (isEditing) return;
    shownOver = over;
    if (over.classList.contains('diff-tidied-letter') && over instanceof HTMLElement) {
      fillForLetter(over);
    } else {
      const change = changeOfFragment(over, changes, fragmentsAll());
      if (change === null) return;
      fillForChange(change);
    }
    place(over);
  }

  function hide(): void {
    bar.hidden = true;
    shownOver = null;
  }

  /**
   * The bar stays up by itself only over a change still open. One he has dealt with
   * goes quiet, which is how he sees it is done, and answers when the pointer is on it.
   */
  const showCurrent = (): void => {
    const isOpen = current !== null && !editing.isResolved(changes.indexOf(current));
    if (current === null || !isOpen || isEditing || isOutOfTheWay) hide();
    else showOver(current);
  };

  function cancelTimers(): void {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
  }

  // On the pointer moving and not merely being there, so that a pointer left
  // resting on the text does not raise a bar over what he is reading.
  box.addEventListener('pointermove', (event) => {
    if (!(event.target instanceof Element) || isEditing) return;
    const over = event.target.closest(HOVERABLE);
    if (over === shownOver) {
      if (over !== null) cancelTimers();
      return;
    }
    cancelTimers();
    if (over === null) {
      hideTimer = setTimeout(showCurrent, HIDE_AFTER_MS);
      return;
    }
    showTimer = setTimeout(() => {
      if (isOutOfTheWay && changeOfFragment(over, changes, fragmentsAll()) === current) setOutOfTheWay(false);
      showOver(over);
    }, SHOW_AFTER_MS);
  });

  box.addEventListener('pointerleave', () => {
    cancelTimers();
    hideTimer = setTimeout(showCurrent, HIDE_AFTER_MS);
  });

  bar.addEventListener('pointerenter', cancelTimers);
  bar.addEventListener('pointerleave', () => {
    hideTimer = setTimeout(showCurrent, HIDE_AFTER_MS);
  });

  box.addEventListener('scroll', () => {
    if (shownOver !== null) place(shownOver);
    else if (current !== null && !isEditing) showCurrent();
  });

  return {
    setCurrent(change) {
      // The first call only restores where a redraw left off. After that it is him
      // stepping or clicking to a change, which brings the bar back.
      if (current !== null && isOutOfTheWay) setOutOfTheWay(false);
      current = change;
      cancelTimers();
      showCurrent();
    },
  };
}
