import { type Language, describeWhen, strings } from '../language/wording.ts';
import type { NoteVersion } from '../notes/note.ts';
import { paragraphsNotIn } from '../notes/text-change.ts';
import { icon } from './icons.ts';

export interface VersionsHandlers {
  /** Put this text in front of him. The save that follows keeps what was there. */
  onRestore: (version: NoteVersion) => void;
  onClose: () => void;
}

/** One copy, told apart from the others by when it was taken and how long it is. */
function rowFor(
  version: NoteVersion,
  language: Language,
  words: ReturnType<typeof strings>,
  show: (version: NoteVersion) => void,
): HTMLElement {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'review-row';

  const when = document.createElement('span');
  when.className = 'review-title';
  when.textContent = describeWhen(version.takenAt, language);

  const howMuch = document.createElement('span');
  howMuch.className = 'review-when';
  howMuch.textContent = words.versionLength(version.text.length);

  row.append(when, howMuch);
  row.addEventListener('click', () => show(version));
  return row;
}

/**
 * What his text used to say, and the way back to it.
 *
 * The same dialog the deleted texts use, down to the class names, because it is
 * the same thing being done: reading something he cannot edit and deciding
 * whether to have it back. One shape learned once.
 *
 * What differs is the list. Every copy of one text opens the same way, so a
 * snippet would tell him nothing — when it was taken and how much was there is
 * what tells them apart.
 */
export function openVersionsDialog(
  container: HTMLElement,
  title: string,
  versions: readonly NoteVersion[],
  current: string,
  language: Language,
  handlers: VersionsHandlers,
): () => void {
  const words = strings(language);
  let showing: NoteVersion | null = null;

  function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
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

  function heading(name: string, note: string): HTMLElement {
    const header = document.createElement('header');
    const stacked = document.createElement('div');
    stacked.className = 'review-heading';

    const what = document.createElement('h1');
    what.textContent = name;
    const said = document.createElement('p');
    said.className = 'review-note';
    said.textContent = note;

    stacked.append(what, said);
    header.append(stacked, dismissButton());
    return header;
  }

  function show(version: NoteVersion): void {
    showing = version;
    fill();
  }

  function fillList(): void {
    const list = document.createElement('div');
    list.className = 'review-list';
    for (const version of versions) list.append(rowFor(version, language, words, show));

    const footer = document.createElement('footer');
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'keep';
    done.textContent = words.close;
    done.addEventListener('click', handlers.onClose);
    footer.append(done);

    panel.replaceChildren(heading(words.versionsTitle(title), words.versionsNote), list, footer);
    done.focus();
  }

  /** One copy, with what his text no longer holds marked out inside it. */
  function fillText(version: NoteVersion): void {
    const pieces = paragraphsNotIn(version.text, current);
    const anyMissing = pieces.some((piece) => piece.missing);

    const body = document.createElement('div');
    body.className = 'review-text';
    body.append(
      ...pieces.map((piece) => {
        if (!piece.missing) return piece.text;
        const gone = document.createElement('strong');
        gone.className = 'review-gone';
        gone.textContent = piece.text;
        return gone;
      }),
    );

    const aside = document.createElement('p');
    aside.className = 'review-note-aside';
    aside.textContent = words.versionMissing;
    aside.hidden = !anyMissing;

    const column = document.createElement('div');
    column.className = 'review-body';
    column.append(aside, body);

    const footer = document.createElement('footer');
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'keep';
    back.textContent = words.versionRestore;
    back.addEventListener('click', () => handlers.onRestore(version));

    const toList = document.createElement('button');
    toList.type = 'button';
    toList.textContent = words.versionsBack;
    toList.addEventListener('click', () => {
      showing = null;
      fill();
    });

    footer.append(back, toList);
    panel.replaceChildren(
      heading(words.versionTitle(describeWhen(version.takenAt, language)), title),
      column,
      footer,
    );
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
