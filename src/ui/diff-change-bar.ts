import { letterSegmentsOf } from '../notes/text-review.ts';

/** What the reviewer of a proposal can do to it, from the bar above each change. */
export interface DiffEditing {
  /** The change to start on, by its place among the changes. */
  startAt?: number;
  isUndone: (changeAt: number) => boolean;
  /** What the change would now put there, for editing. */
  addedOf: (changeAt: number) => string;
  onUndo: (changeAt: number) => void;
  onRestore: (changeAt: number) => void;
  onEdit: (changeAt: number, text: string) => void;
  /** Called when an edit is backed out of, so that what it disturbed can be drawn again. */
  onCancelEdit: () => void;
  /** Letters chosen so far for a tidied word, slot by slot. */
  lettersOf: (tidyAt: number) => readonly string[];
  onPickLetter: (tidyAt: number, slot: number, letter: string) => void;
  onCurrent: (changeAt: number) => void;
}

/** Long enough that a pointer passing over on its way somewhere raises nothing. */
const SHOW_AFTER_MS = 150;
/** Long enough for an unsteady hand to get from the word up to the button. */
const HIDE_AFTER_MS = 400;
const GAP_ABOVE_PX = 3;

const HOVERABLE = '.diff-change, .diff-change-carried, .diff-tidied-word';

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
 * Turns the wording a change proposes into a place to type, right there in the
 * sentence. Clicking anywhere else keeps what was typed, the way everything in the
 * app saves; Escape backs out.
 */
function startEditing(change: HTMLElement, fragments: readonly Element[], at: number, editing: DiffEditing): void {
  const added = editing.addedOf(at);
  const words = added.trim();
  const start = added.indexOf(words);
  const [lead, trail] = [added.slice(0, start), added.slice(start + words.length)];

  const field = document.createElement('span');
  field.className = 'diff-edit';
  field.contentEditable = 'plaintext-only';
  field.spellcheck = false;
  field.textContent = words;

  const place = fragments.flatMap((fragment) => [...fragment.querySelectorAll('.diff-new')]);
  const [first, ...rest] = place;
  if (first === undefined) change.append(field);
  else first.replaceWith(field);
  for (const other of rest) other.remove();

  let isBackingOut = false;
  field.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    isBackingOut = true;
    event.stopPropagation();
    field.blur();
  });
  field.addEventListener('blur', () => {
    if (isBackingOut) {
      editing.onCancelEdit();
      return;
    }
    const typed = field.textContent ?? '';
    if (typed === words) editing.onCancelEdit();
    else editing.onEdit(at, lead + typed + trail);
  });

  field.focus();
  getSelection()?.selectAllChildren(field);
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
  bar.className = 'diff-bar';
  bar.hidden = true;
  framed.append(bar);

  let current: HTMLElement | null = null;
  let shownOver: Element | null = null;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let isEditing = false;

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
    const undone = editing.isUndone(at);
    bar.replaceChildren(
      undone
        ? barButton('Vrati predlog', 'diff-bar-new', () => editing.onRestore(at))
        : barButton('Vrati staro', 'diff-bar-old', () => editing.onUndo(at)),
    );
    if (undone) return;
    bar.append(
      barButton('Izmeni', 'diff-bar-edit', () => {
        isEditing = true;
        hide();
        startEditing(change, fragmentsOf(change), at, editing);
      }),
    );
  }

  function fillForWord(word: HTMLElement): void {
    const tidyAt = Number(word.dataset['tidyAt']);
    const chosen = editing.lettersOf(tidyAt);
    const segments = letterSegmentsOf(word.dataset['was'] ?? '', word.dataset['proposed'] ?? '');

    let slot = -1;
    bar.replaceChildren(
      ...segments.flatMap((segment) => {
        if (segment.kind !== 'slot') return [];
        slot += 1;
        const thisSlot = slot;
        const showing = chosen[thisSlot] ?? segment.proposed;
        const group = document.createElement('span');
        group.className = 'diff-bar-letters';
        group.append(
          ...segment.choices.map((letter) =>
            barButton(
              letter,
              letter === showing ? 'diff-bar-letter diff-bar-letter-chosen' : 'diff-bar-letter',
              () => editing.onPickLetter(tidyAt, thisSlot, letter),
            ),
          ),
        );
        return [group];
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
    const left = Math.min(line.left - frame.left, frame.width - bar.offsetWidth);
    bar.style.left = `${Math.max(0, left)}px`;
    bar.style.top = `${line.top - frame.top - bar.offsetHeight - GAP_ABOVE_PX}px`;
  }

  function showOver(over: Element): void {
    if (isEditing) return;
    shownOver = over;
    if (over.classList.contains('diff-tidied-word') && over instanceof HTMLElement) {
      fillForWord(over);
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

  const showCurrent = (): void => {
    if (current === null || isEditing) hide();
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
    showTimer = setTimeout(() => showOver(over), SHOW_AFTER_MS);
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
      current = change;
      cancelTimers();
      showCurrent();
    },
  };
}
