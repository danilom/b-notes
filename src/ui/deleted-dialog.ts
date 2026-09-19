import { type Language, describeWhen, strings } from '../language/wording.ts';
import type { Note } from '../notes/note.ts';
import { icon } from './icons.ts';
import { matches } from './note-list.ts';

/** Enough of the text to tell two similar openings apart, and no more. */
const SNIPPET = 140;

export interface DeletedHandlers {
  onRestore: (id: string) => void;
  onClose: () => void;
}

/**
 * The start of the text, flattened onto one line.
 *
 * Without the title, which is already on the row above it: repeating it would
 * spend the one line that exists to tell three similar texts apart.
 */
export function snippetOf(note: Note): string {
  const flat = note.text.replace(/\s+/g, ' ').trim();
  const rest = flat.startsWith(note.title) ? flat.slice(note.title.length).trim() : flat;
  return rest.length > SNIPPET ? `${rest.slice(0, SNIPPET)}…` : rest;
}

function rowFor(
  note: Note,
  language: Language,
  words: ReturnType<typeof strings>,
  show: (note: Note) => void,
): HTMLElement {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'deleted-row';

  const title = document.createElement('span');
  title.className = 'deleted-title';
  // Same word the list uses for a text with nothing at the top of it. A text he
  // emptied and then deleted has no title and no snippet, and a blank row would
  // read as the app having lost track of something.
  title.textContent = note.title.length > 0 ? note.title : words.untitled;

  // The same time this text would have shown in the list, meaning the same
  // thing: when he last worked on it. Nothing records when he deleted it.
  const when = document.createElement('span');
  when.className = 'deleted-when';
  when.textContent = describeWhen(note.updatedAt, language);

  const snippet = document.createElement('span');
  snippet.className = 'deleted-snippet';
  snippet.textContent = snippetOf(note);

  const opens = document.createElement('span');
  opens.className = 'deleted-opens';
  opens.setAttribute('aria-hidden', 'true');
  opens.textContent = '›';

  row.append(title, when, snippet, opens);
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
  container: HTMLElement,
  deleted: readonly Note[],
  query: string,
  language: Language,
  handlers: DeletedHandlers,
): () => void {
  const words = strings(language);
  let filter = query.trim();
  let showing: Note | null = null;

  function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    // One step back, not all the way out. Escape costs him nothing here — it
    // closes something he cannot type into — which is why it is allowed at all.
    if (showing === null) {
      handlers.onClose();
      return;
    }
    showing = null;
    fill();
  }

  const close = (): void => {
    container.hidden = true;
    container.replaceChildren();
    document.removeEventListener('keydown', onKey);
  };

  const panel = document.createElement('div');
  panel.className = 'panel deleted-panel';
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

  const shown = (): readonly Note[] =>
    filter.length === 0 ? deleted : deleted.filter((note) => matches(note, filter));

  function show(note: Note): void {
    showing = note;
    fill();
  }

  /** The list of what he put away, with whatever search brought him here. */
  function fillList(): void {
    const header = document.createElement('header');
    // The title and its sentence stack; the X sits beside the pair of them.
    const heading = document.createElement('div');
    heading.className = 'deleted-heading';
    const title = document.createElement('h1');
    title.textContent = words.deleted;
    const kept = document.createElement('p');
    kept.className = 'deleted-kept';
    kept.textContent = words.deletedKept;
    heading.append(title, kept);
    header.append(heading, dismissButton());

    const list = document.createElement('div');
    list.className = 'deleted-list';

    if (filter.length > 0) {
      const line = document.createElement('div');
      line.className = 'deleted-filter';
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
    done.focus();
  }

  /** One text, to read but not to touch. */
  function fillText(note: Note): void {
    const header = document.createElement('header');
    const title = document.createElement('h1');
    title.textContent = words.deletedPreview(note.title.length > 0 ? note.title : words.untitled);
    header.append(title, dismissButton());

    // A plain block, not a textarea he cannot type into: there is no caret to
    // put in it, so nothing suggests it would take his typing. Selecting still
    // works, which is his way out if what he wants is one paragraph of it.
    const body = document.createElement('div');
    if (note.text.trim().length === 0) {
      body.className = 'deleted-text deleted-text-empty';
      body.textContent = words.deletedEmpty;
    } else {
      body.className = 'deleted-text';
      body.textContent = note.text;
    }

    const footer = document.createElement('footer');
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'keep';
    back.textContent = words.restore;
    back.addEventListener('click', () => handlers.onRestore(note.id));

    const never = document.createElement('button');
    never.type = 'button';
    never.textContent = words.cancel;
    never.addEventListener('click', () => {
      showing = null;
      fill();
    });

    footer.append(back, never);
    panel.replaceChildren(header, body, footer);
    back.focus();
  }

  function fill(): void {
    if (showing === null) fillList();
    else fillText(showing);
  }

  fill();
  container.replaceChildren(panel);
  container.hidden = false;
  document.addEventListener('keydown', onKey);

  return close;
}
