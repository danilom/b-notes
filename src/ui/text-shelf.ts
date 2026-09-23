import { type Language, strings } from '../language/wording.ts';
import { type Shown, showAsModal } from './modal.ts';
import { type IconName, icon } from './icons.ts';
import { matches } from './note-list.ts';
import { titleOf } from './dialog-heading.ts';
import { onOneLine } from './text-snippet.ts';

/**
 * Picking one text off a shelf his list is not.
 *
 * Two places keep writing that is not among his texts: `Obrisano`, which he
 * filled himself, and `Arhiva`, which somebody filled for him. Different
 * intents, and so different words and different buttons — but one act. He
 * comes looking for something that is not in front of him, reads one of them
 * to be sure, and takes it.
 *
 * This was two files, 73% identical. That alone would only have been ugly —
 * but the copy was written by hand and drifted at once: the deleted side read
 * its texts all at once and the archive read them one after another, which on
 * six hundred texts is 1950ms against 450. A second copy of a shape is a
 * second place for it to be wrong, and this one was wrong the day it was
 * written.
 *
 * So the shape lives here and says nothing about either place. What differs —
 * what the screen is called, what a row's second line says, what the buttons
 * do — is handed in by whoever opens it.
 */

/**
 * Enough of the text to tell two similar openings apart.
 *
 * A bound on what goes into the row rather than what shows in it: the row
 * clamps to two lines and cuts with its own ellipsis, and how many characters
 * that is depends on how wide his window is and how big he has set the type.
 */
const SNIPPET = 320;

/** A text that is not in his list: put away, or brought in from elsewhere. */
export interface ShelvedText {
  id: string;
  title: string;
  text: string;
  /** Folded, so a search here finds his writing the way the list does. */
  searchable: string;
  updatedAt: number;
}

/**
 * One thing the footer offers to do with the text on screen.
 *
 * `strength` is what it looks like, and the three are deliberate: `main` is
 * what he came here to press, `plain` is everything else, and `grave` is the
 * one that loses writing — which is kept at the far end of the row so it is
 * never what he hits aiming for one of the other two.
 */
export interface ShelfAction {
  label: string;
  strength: 'main' | 'plain' | 'grave';
  act: () => void;
}

/** What one shelf is: its words, and what it offers to do with a text. */
export interface Shelf<T extends ShelvedText> {
  /** The same mark as on the control that opens this. */
  mark: IconName;
  /** What the place is called, over the list. */
  heading: string;
  /** The sentence under it, saying what he is here to do. */
  intro: string;
  /** What the screen for one text is called. */
  previewHeading: string;
  /** The sentence under that. */
  previewIntro: string;
  /** What to say where the text itself says nothing. */
  emptyText: string;
  /** The row's second line: when it was put there, or where it came from. */
  whenFor: (note: T) => string;
  /**
   * The one fact that decides whether he wants this, or null when there is
   * none. Shown in the accent colour, on the row and again at the top of the
   * preview — on the row so he can scan for it, in the preview because that is
   * where he decides.
   */
  markedFor?: (note: T) => string | null;
  /** Lines above the text in the preview. Empty ones are left out. */
  notesFor?: (note: T) => string[];
  /** How the filter line counts what a search matched. */
  matching: (found: number, query: string) => string;
  /** What the footer offers. `main` first; at most one `grave`. */
  actionsFor: (note: T) => ShelfAction[];
  /** The word on the button back to the list. */
  backLabel: string;
}

/** What he is looking at, and what he had searched for on the way in. */
export interface ShelfContents<T extends ShelvedText> {
  texts: readonly T[];
  /**
   * What was in the search box when he opened it, which the list arrives
   * filtered by. Named rather than ordered, so it cannot be handed over in the
   * place where the language goes.
   */
  query: string;
}

export interface ShelfHandlers {
  onClose: () => void;
}

/**
 * The start of the text, flattened onto one line.
 *
 * Without the title, which is already on the row above it: repeating it would
 * spend the one line that exists to tell three similar texts apart.
 */
export function snippetOf(note: ShelvedText): string {
  const flat = note.text.replace(/\s+/g, ' ').trim();
  const rest = flat.startsWith(note.title) ? flat.slice(note.title.length).trim() : flat;
  return onOneLine(rest, SNIPPET);
}

function rowFor<T extends ShelvedText>(
  note: T,
  shelf: Shelf<T>,
  words: ReturnType<typeof strings>,
  show: (note: T) => void,
): HTMLElement {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'review-row';

  const title = document.createElement('span');
  title.className = 'review-title';
  // Same word the list uses for a text with nothing at the top of it. A text
  // he emptied has no title and no snippet, and a blank row would read as the
  // app having lost track of something.
  title.textContent = note.title.length > 0 ? note.title : words.untitled;

  const when = document.createElement('span');
  when.className = 'review-when';
  when.textContent = shelf.whenFor(note);

  // A text he emptied has nothing to show. Saying so beats leaving the line
  // out: the row keeps the height of the others, which is the difference
  // between a comfortable target and a thin one, and "there is nothing in
  // this" is a fact about the text rather than a gap in the app.
  const said = snippetOf(note);
  const snippet = document.createElement('span');
  snippet.className = said.length > 0 ? 'review-snippet' : 'review-snippet review-snippet-none';
  snippet.textContent = said.length > 0 ? said : words.untexted;

  row.append(title, when, snippet);

  const marked = shelf.markedFor?.(note) ?? null;
  if (marked !== null) {
    const line = document.createElement('span');
    line.className = 'review-already';
    line.textContent = marked;
    row.append(line);
  }

  row.addEventListener('click', () => show(note));
  return row;
}

const CLASS_FOR: Record<ShelfAction['strength'], string> = {
  main: 'keep',
  plain: '',
  grave: 'danger destroy',
};

export function openTextShelf<T extends ShelvedText>(
  container: HTMLDialogElement,
  shelf: Shelf<T>,
  { texts, query }: ShelfContents<T>,
  language: Language,
  handlers: ShelfHandlers,
): () => void {
  const words = strings(language);
  let filter = query.trim();
  let showing: T | null = null;

  /**
   * One step back, not all the way out. Escape costs him nothing here — it
   * leaves something he cannot type into — which is why it is allowed at all.
   */
  function stepBack(): void {
    if (showing === null) {
      handlers.onClose();
      return;
    }
    showing = null;
    fill();
  }

  /** The open dialog, once it is open. */
  let modal: Shown | null = null;
  const close = (): void => {
    modal?.close();
  };

  const panel = document.createElement('div');
  panel.className = 'panel review-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

  /**
   * The X, in the same corner and doing the same thing as every other
   * dialog's: leave, whichever level he is on. Escape still steps back one at
   * a time, which is the finer-grained answer for a hand already on the
   * keyboard.
   */
  function dismissButton(): HTMLButtonElement {
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'close';
    dismiss.title = words.close;
    dismiss.setAttribute('aria-label', words.close);
    dismiss.append(icon('close'));
    dismiss.addEventListener('click', handlers.onClose);
    return dismiss;
  }

  const shown = (): readonly T[] =>
    filter.length === 0 ? texts : texts.filter((note) => matches(note, filter));

  function show(note: T): void {
    showing = note;
    fill();
  }

  /** The title and its sentence stack; the X sits beside the pair of them. */
  function headerFor(label: string, sentence: string, name?: string): HTMLElement {
    const header = document.createElement('header');
    const heading = document.createElement('div');
    heading.className = 'review-heading';
    heading.append(
      titleOf(name === undefined ? { mark: shelf.mark, label } : { mark: shelf.mark, label, name }),
    );
    const said = document.createElement('p');
    said.className = 'review-note';
    said.textContent = sentence;
    heading.append(said);
    header.append(heading, dismissButton());
    return header;
  }

  /** What he put here, with whatever search brought him here. */
  function fillList(): void {
    const list = document.createElement('div');
    list.className = 'review-list';

    if (filter.length > 0) {
      const line = document.createElement('div');
      line.className = 'review-filter';
      const count = document.createElement('span');
      count.textContent = shelf.matching(shown().length, filter);
      const all = document.createElement('button');
      all.type = 'button';
      all.className = 'quiet';
      all.textContent = words.showAll;
      all.addEventListener('click', () => {
        filter = '';
        fill();
      });
      line.append(count, all);
      list.append(line);
    }

    for (const note of shown()) list.append(rowFor(note, shelf, words, show));

    const footer = document.createElement('footer');
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'keep';
    done.textContent = words.close;
    done.addEventListener('click', handlers.onClose);
    footer.append(done);

    panel.replaceChildren(headerFor(shelf.heading, shelf.intro), list, footer);
    if (!container.hidden) done.focus();
  }

  /** One text, to read but not to touch. */
  function fillText(note: T): void {
    // No line saying it cannot be written in. The surface says it: a plain
    // block rather than a textarea, tinted and bordered where the page is
    // neither, at a smaller size, with no caret to put in it and an arrow over
    // it rather than an I-beam. Selecting still works, which is his way out if
    // what he wants is one paragraph of it.
    const body = document.createElement('div');
    if (note.text.trim().length === 0) {
      body.className = 'review-text review-text-empty';
      body.textContent = shelf.emptyText;
    } else {
      body.className = 'review-text';
      body.textContent = note.text;
    }

    // What is true about this text before he decides. Above the text, because
    // these are about the writing rather than about the dialog.
    const column = document.createElement('div');
    column.className = 'review-body';

    const marked = shelf.markedFor?.(note) ?? null;
    if (marked !== null) {
      const line = document.createElement('p');
      line.className = 'review-note-aside review-already';
      line.textContent = marked;
      column.append(line);
    }

    for (const said of shelf.notesFor?.(note) ?? []) {
      if (said.length === 0) continue;
      const line = document.createElement('p');
      line.className = 'review-note-aside';
      line.textContent = said;
      column.append(line);
    }
    column.append(body);

    const footer = document.createElement('footer');
    let main: HTMLButtonElement | null = null;
    for (const action of shelf.actionsFor(note)) {
      const button = document.createElement('button');
      button.type = 'button';
      if (CLASS_FOR[action.strength].length > 0) button.className = CLASS_FOR[action.strength];
      button.textContent = action.label;
      button.addEventListener('click', action.act);
      // The grave one goes first in the row and so furthest from the others,
      // the way the appearance panel keeps Vrati na početno away from U redu.
      if (action.strength === 'grave') footer.prepend(button);
      else footer.append(button);
      if (action.strength === 'main') main = button;
    }

    // Named for where it goes, not as a cancel. Otkaži would promise to undo
    // his coming in at all, and what this does is step back one level.
    const toList = document.createElement('button');
    toList.type = 'button';
    toList.textContent = shelf.backLabel;
    toList.addEventListener('click', () => {
      showing = null;
      fill();
    });
    footer.append(toList);

    const name = note.title.length > 0 ? note.title : words.untitled;
    panel.replaceChildren(headerFor(shelf.previewHeading, shelf.previewIntro, name), column, footer);
    main?.focus();
  }

  function fill(): void {
    if (showing === null) fillList();
    else fillText(showing);
  }

  fill();
  modal = showAsModal(container, panel, stepBack);
  /*
    After the panel is on screen, not before.

    Focusing a hidden element does nothing, so a call made while the panel was
    still being built was silently lost — and what it was lost to is the editor
    behind the dialog. He clicks the text he cannot edit, types, and the letters
    go into the writing underneath, where the panel hides them until the save
    carries them to disk.

    The panel itself rather than a button in it: focus has to leave the editor,
    but Enter is a reflex at a dialog and nothing here should answer it.
  */
  panel.tabIndex = -1;
  panel.focus();

  return close;
}
