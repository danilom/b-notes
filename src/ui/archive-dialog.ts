import { type Language, describeWhen, strings } from '../language/wording.ts';
import { type Shown, showAsModal } from './modal.ts';
import type { ArchivedNote } from '../notes/note.ts';
import { icon } from './icons.ts';
import { matches } from './note-list.ts';
import { titleOf } from './dialog-heading.ts';
import { onOneLine } from './text-snippet.ts';

/**
 * Enough of the text to tell two similar openings apart.
 *
 * The same bound the deleted dialog uses, and for the same reason: the row
 * clamps to two lines and cuts with its own ellipsis, and how many characters
 * that is depends on his window and his type size.
 */
const SNIPPET = 320;

export interface ArchiveHandlers {
  onBringBack: (note: ArchivedNote) => void;
  onClose: () => void;
}

/** The start of the text, flattened, without the title already on the row. */
export function snippetOf(note: ArchivedNote): string {
  const flat = note.text.replace(/\s+/g, ' ').trim();
  const rest = flat.startsWith(note.title) ? flat.slice(note.title.length).trim() : flat;
  return onOneLine(rest, SNIPPET);
}

function rowFor(
  note: ArchivedNote,
  language: Language,
  words: ReturnType<typeof strings>,
  show: (note: ArchivedNote) => void,
): HTMLElement {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'review-row';

  const title = document.createElement('span');
  title.className = 'review-title';
  title.textContent = note.title.length > 0 ? note.title : words.untitled;

  /*
    Which archive, then when it was last written — in that order, because the
    folder is the only thing that says where this came from and the date alone
    would read as one more old text. The date is the file's own: an archived
    text is not touched until it is brought in, so it still says when it was
    last written on whatever machine it came off.
  */
  const when = document.createElement('span');
  when.className = 'review-when';
  when.textContent = words.archiveFrom(note.archive, describeWhen(note.updatedAt, language));

  const said = snippetOf(note);
  const snippet = document.createElement('span');
  snippet.className = said.length > 0 ? 'review-snippet' : 'review-snippet review-snippet-none';
  snippet.textContent = said.length > 0 ? said : words.untexted;

  row.append(title, when, snippet);

  // Said on the row rather than only in the preview, because the whole reason
  // to look at the list is to find the few that are not copies of what he has.
  if (note.alsoLive) {
    const already = document.createElement('span');
    already.className = 'review-already';
    already.textContent = words.archiveAlsoLive;
    row.append(already);
  }

  row.addEventListener('click', () => show(note));
  return row;
}

/** What this dialog is about: everything in the archives, and what he searched. */
export interface ArchivedTexts {
  archived: readonly ArchivedNote[];
  /**
   * What was in the search box when he opened it, which the list arrives
   * filtered by. Named rather than ordered, so it cannot be handed over in the
   * place where the language goes.
   */
  query: string;
}

/**
 * Writing brought in from elsewhere, and one of them at a time to read.
 *
 * The same shape as the deleted dialog — list, then one text, read-only —
 * because it is the same act: find something that is not in front of you, look
 * at it, decide. What differs is the intent, which is why it is a dialog of
 * its own rather than a second tab on that one: nothing in here was ever his
 * to lose, so there is nothing to destroy and no second chance being offered.
 */
export function openArchiveDialog(
  container: HTMLDialogElement,
  { archived, query }: ArchivedTexts,
  language: Language,
  handlers: ArchiveHandlers,
): () => void {
  const words = strings(language);
  let filter = query.trim();
  let showing: ArchivedNote | null = null;

  /** One step back, not all the way out — the same as the other dialogs. */
  function stepBack(): void {
    if (showing === null) {
      handlers.onClose();
      return;
    }
    showing = null;
    fill();
  }

  let modal: Shown | null = null;
  const close = (): void => {
    modal?.close();
  };

  const panel = document.createElement('div');
  panel.className = 'panel review-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');

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

  const shown = (): readonly ArchivedNote[] =>
    filter.length === 0 ? archived : archived.filter((note) => matches(note, filter));

  function show(note: ArchivedNote): void {
    showing = note;
    fill();
  }

  function fillList(): void {
    const header = document.createElement('header');
    const heading = document.createElement('div');
    heading.className = 'review-heading';
    const title = titleOf({ mark: 'archive', label: words.archive });
    const intro = document.createElement('p');
    intro.className = 'review-note';
    intro.textContent = words.archiveIntro;
    heading.append(title, intro);
    header.append(heading, dismissButton());

    const list = document.createElement('div');
    list.className = 'review-list';

    if (filter.length > 0) {
      const line = document.createElement('div');
      line.className = 'review-filter';
      const count = document.createElement('span');
      count.textContent = words.archiveMatching(shown().length, filter);
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
  function fillText(note: ArchivedNote): void {
    const header = document.createElement('header');
    const heading = document.createElement('div');
    heading.className = 'review-heading';
    const title = titleOf({
      mark: 'archive',
      label: words.archivePreview,
      name: note.title.length > 0 ? note.title : words.untitled,
    });
    const check = document.createElement('p');
    check.className = 'review-note';
    check.textContent = words.archivePreviewCheck;
    heading.append(title, check);
    header.append(heading, dismissButton());

    // What is true about this text before he decides: where it is from, that
    // he may already have one like it, and what comes with it. Above the text
    // because all three are about the writing rather than about the dialog.
    const from = document.createElement('p');
    from.className = 'review-note-aside';
    from.textContent = words.archiveFrom(note.archive, describeWhen(note.updatedAt, language));

    const already = document.createElement('p');
    already.className = 'review-note-aside review-already';
    already.textContent = words.archiveAlsoLive;
    already.hidden = !note.alsoLive;

    const alsoKept = document.createElement('p');
    alsoKept.className = 'review-note-aside';
    alsoKept.textContent = words.archiveVersions(note.versions);
    alsoKept.hidden = note.versions === 0;

    const body = document.createElement('div');
    if (note.text.trim().length === 0) {
      body.className = 'review-text review-text-empty';
      body.textContent = words.archiveEmpty;
    } else {
      body.className = 'review-text';
      body.textContent = note.text;
    }

    const footer = document.createElement('footer');
    const bring = document.createElement('button');
    bring.type = 'button';
    bring.className = 'keep';
    bring.textContent = words.archiveBring;
    bring.addEventListener('click', () => handlers.onBringBack(note));

    // No Uništi zauvek beside it. The deleted dialog has one because he put
    // those texts there and can finish the job; an archive is somebody else's
    // folder that he was given a way into, and emptying it is not his to do
    // from in here.
    const toList = document.createElement('button');
    toList.type = 'button';
    toList.textContent = words.archiveBack;
    toList.addEventListener('click', () => {
      showing = null;
      fill();
    });

    footer.append(bring, toList);

    const column = document.createElement('div');
    column.className = 'review-body';
    column.append(from, already, alsoKept, body);

    panel.replaceChildren(header, column, footer);
    bring.focus();
  }

  function fill(): void {
    if (showing === null) fillList();
    else fillText(showing);
  }

  fill();
  modal = showAsModal(container, panel, stepBack);
  // After the panel is on screen: focusing a hidden element does nothing, and
  // what the lost focus falls back to is the editor behind the dialog.
  panel.tabIndex = -1;
  panel.focus();

  return close;
}
