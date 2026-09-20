import { type Language, describeWhen, strings } from '../language/wording.ts';
import { type Shown, showAsModal } from './modal.ts';
import type { DeletedNote } from '../notes/note.ts';
import { icon } from './icons.ts';
import { matches } from './note-list.ts';
import { titleOf } from './dialog-heading.ts';
import { onOneLine } from './text-snippet.ts';

/**
 * Enough of the text to tell two similar openings apart.
 *
 * A bound on what goes into the row rather than what shows in it: the row
 * clamps to two lines and cuts with its own ellipsis, and how many characters
 * that is depends on how wide his window is and how big he has set the type.
 */
const SNIPPET = 320;

export interface DeletedHandlers {
  onRestore: (id: string) => void;
  onDestroy: (note: DeletedNote) => void;
  onClose: () => void;
}

/**
 * The start of the text, flattened onto one line.
 *
 * Without the title, which is already on the row above it: repeating it would
 * spend the one line that exists to tell three similar texts apart.
 */
export function snippetOf(note: DeletedNote): string {
  const flat = note.text.replace(/\s+/g, ' ').trim();
  const rest = flat.startsWith(note.title) ? flat.slice(note.title.length).trim() : flat;
  return onOneLine(rest, SNIPPET);
}

function rowFor(
  note: DeletedNote,
  language: Language,
  words: ReturnType<typeof strings>,
  show: (note: DeletedNote) => void,
): HTMLElement {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'review-row';

  const title = document.createElement('span');
  title.className = 'review-title';
  // Same word the list uses for a text with nothing at the top of it. A text he
  // emptied and then deleted has no title and no snippet, and a blank row would
  // read as the app having lost track of something.
  title.textContent = note.title.length > 0 ? note.title : words.untitled;

  // When he put it away, which is what a file in Obrisano has for a time: it
  // is written on the way in, so the moment it landed is the moment it says.
  const when = document.createElement('span');
  when.className = 'review-when';
  when.textContent = words.deletedWhen(describeWhen(note.updatedAt, language));

  // A text he emptied before deleting has nothing to show. Saying so beats
  // leaving the line out: the row keeps the height of the others, which is the
  // difference between a comfortable target and a thin one, and "there is
  // nothing in this" is a fact about the text rather than a gap in the app.
  const said = snippetOf(note);
  const snippet = document.createElement('span');
  snippet.className = said.length > 0 ? 'review-snippet' : 'review-snippet review-snippet-none';
  snippet.textContent = said.length > 0 ? said : words.untexted;

  row.append(title, when, snippet);
  row.addEventListener('click', () => show(note));
  return row;
}

/**
 * Everything he has put away, and one of them at a time to read.
 *
 * A dialog rather than a corner of the app, because bringing a text back is a
 * thing he does instead of writing, not alongside it. Being unable to reach his
 * writing while it is open is what makes the text inside it obviously not his
 * to edit — no caret, nothing to type into, and no explaining required.
 */
export function openDeletedDialog(
  container: HTMLDialogElement,
  deleted: readonly DeletedNote[],
  query: string,
  language: Language,
  handlers: DeletedHandlers,
): () => void {
  const words = strings(language);
  let filter = query.trim();
  let showing: DeletedNote | null = null;

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
   * The X, in the same corner and doing the same thing as the other two
   * dialogs': leave, whichever level he is on. Escape still steps back one at a
   * time, which is the finer-grained answer for a hand already on the keyboard.
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

  const shown = (): readonly DeletedNote[] =>
    filter.length === 0 ? deleted : deleted.filter((note) => matches(note, filter));

  function show(note: DeletedNote): void {
    showing = note;
    fill();
  }

  /** The list of what he put away, with whatever search brought him here. */
  function fillList(): void {
    const header = document.createElement('header');
    // The title and its sentence stack; the X sits beside the pair of them.
    const heading = document.createElement('div');
    heading.className = 'review-heading';
    const title = titleOf({ mark: 'delete', label: words.deleted });
    const kept = document.createElement('p');
    kept.className = 'review-note';
    kept.textContent = words.deletedKept;
    heading.append(title, kept);
    header.append(heading, dismissButton());

    const list = document.createElement('div');
    list.className = 'review-list';

    if (filter.length > 0) {
      const line = document.createElement('div');
      line.className = 'review-filter';
      const count = document.createElement('span');
      count.textContent = words.deletedMatching(shown().length, filter);
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

    for (const note of shown()) list.append(rowFor(note, language, words, show));

    const footer = document.createElement('footer');
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'keep';
    done.textContent = words.close;
    done.addEventListener('click', handlers.onClose);
    footer.append(done);

    panel.replaceChildren(header, list, footer);
    if (!container.hidden) done.focus();
  }

  /** One text, to read but not to touch. */
  function fillText(note: DeletedNote): void {
    const header = document.createElement('header');
    // The same shape as the list's heading, and for the same reason: the line
    // under the title says what he is here to do.
    const heading = document.createElement('div');
    heading.className = 'review-heading';
    const title = titleOf({
      mark: 'delete',
      label: words.deletedPreview,
      name: note.title.length > 0 ? note.title : words.untitled,
    });
    const check = document.createElement('p');
    check.className = 'review-note';
    check.textContent = words.deletedPreviewCheck;
    heading.append(title, check);
    header.append(heading, dismissButton());

    // What else is kept of it. Above the text, because it is about the writing
    // rather than about the dialog, and silent when there is nothing to say.
    const alsoKept = document.createElement('p');
    alsoKept.className = 'review-note-aside';
    alsoKept.textContent = words.deletedVersions(note.versions);
    alsoKept.hidden = note.versions === 0;

    // No line saying it cannot be written in. The surface says it: a plain
    // block rather than a textarea, tinted and bordered where the page is
    // neither, at a smaller size, with no caret to put in it and an arrow over
    // it rather than an I-beam. Selecting still works, which is his way out if
    // what he wants is one paragraph of it — and the button that brings the
    // whole thing back is already on screen below.

    const body = document.createElement('div');
    if (note.text.trim().length === 0) {
      body.className = 'review-text review-text-empty';
      body.textContent = words.deletedEmpty;
    } else {
      body.className = 'review-text';
      body.textContent = note.text;
    }

    const footer = document.createElement('footer');
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'keep';
    back.textContent = words.restore;
    back.addEventListener('click', () => handlers.onRestore(note.id));

    // Named for where it goes, not as a cancel. Otkaži here would promise to
    // undo his coming in at all, and what it does is step back one level — the
    // behaviour is right, so it is the word that has to say so.
    // Off on its own at the far end, the way the appearance panel keeps Vrati
    // na početno away from U redu: it must never be what he hits while aiming
    // for one of the two he actually came here to press.
    const forever = document.createElement('button');
    forever.type = 'button';
    forever.className = 'danger destroy';
    forever.textContent = words.destroy;
    forever.addEventListener('click', () => handlers.onDestroy(note));

    const toList = document.createElement('button');
    toList.type = 'button';
    toList.textContent = words.deletedBack;
    toList.addEventListener('click', () => {
      showing = null;
      fill();
    });

    footer.append(forever, back, toList);
    // One box at his measure holding both, so the line above the text starts
    // where the text starts.
    const column = document.createElement('div');
    column.className = 'review-body';
    column.append(alsoKept, body);

    panel.replaceChildren(header, column, footer);
    back.focus();
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
