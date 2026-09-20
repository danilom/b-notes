import { type Language, describeWhen, strings } from '../language/wording.ts';
import type { NoteVersion } from '../notes/note.ts';
import { type DiffRun, diffParagraphs, runsOf } from '../notes/paragraph-diff.ts';
import { icon } from './icons.ts';
import { type Titled, titleOf } from './dialog-heading.ts';
import { beginningAndEnd } from './text-snippet.ts';
import { describeVersion } from './version-row.ts';

export interface VersionsHandlers {
  /** Put this text in front of him. The save that follows keeps what was there. */
  onRestore: (version: NoteVersion) => void;
  onClose: () => void;
}

/** A line that spans the row, under the two the row opens with. */
function under(text: string): HTMLElement {
  const line = document.createElement('span');
  line.className = 'review-snippet';
  line.textContent = text;
  return line;
}

/**
 * One copy, laid out the way the list of his texts is: what it is on the left,
 * when it was on the right. The same two columns in the same two places, since
 * the one he reads every day is the one he has learned.
 */
function rowFor(
  version: NoteVersion,
  current: string,
  title: string,
  language: Language,
  show: (version: NoteVersion) => void,
): HTMLElement {
  const said = describeVersion(version, current, title, language);

  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'review-row';

  const size = document.createElement('span');
  size.className = 'review-title';
  size.textContent = said.size;

  const when = document.createElement('span');
  when.className = 'review-when';
  when.textContent = said.when;

  row.append(size, when);
  // In the order he cares about them: what it was called, then what it would
  // give him back, then what bringing it back would cost.
  for (const line of [said.wasCalled, said.added, said.missing]) {
    if (line !== null) row.append(under(line));
  }

  row.addEventListener('click', () => show(version));
  return row;
}

/** How much of a paragraph he can read elsewhere is worth repeating here. */
const REMINDER = 150;

/**
 * One run of paragraphs, tagged once.
 *
 * What the copy holds is shown in full: it is the only place he can read it.
 * What the active text holds is shortened to its two ends, because he can read
 * that by closing this dialog, and printing it whole would bury what he came
 * for under what he already has.
 */
function blockFor(run: DiffRun, words: ReturnType<typeof strings>): HTMLElement {
  if (run.kind === 'same') {
    const plain = document.createElement('div');
    plain.append(...run.paragraphs.map(paragraphOf));
    return plain;
  }

  const added = run.kind === 'added';
  const block = document.createElement('div');
  block.className = `review-run review-run-${added ? 'added' : 'missing'}`;

  const tag = document.createElement('span');
  tag.className = 'review-tag';

  const why = document.createElement('span');
  why.className = 'review-tag-why';
  why.textContent = added ? words.versionAddedWhy : words.versionMissingWhy;

  tag.append(`${added ? words.versionAddedTag : words.versionMissingTag} `, why);

  block.append(
    tag,
    ...run.paragraphs.map((paragraph) => (added ? paragraphOf(paragraph) : shortenedOf(paragraph))),
  );
  return block;
}

function paragraphOf(text: string): HTMLParagraphElement {
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
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

/**
 * What his text used to say, and the way back to it.
 *
 * The same dialog the deleted texts use, down to the class names, because it is
 * the same thing being done: reading something he cannot edit and deciding
 * whether to have it back. One shape learned once.
 *
 * What differs is the list. Every copy of one text opens the same way, so the
 * opening is no use for telling them apart — what each one still holds that his
 * text has since lost is, and that is the question he came in with.
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

  function heading(named: Titled, note: string): HTMLElement {
    const header = document.createElement('header');
    const stacked = document.createElement('div');
    stacked.className = 'review-heading';

    const said = document.createElement('p');
    said.className = 'review-note';
    said.textContent = note;

    stacked.append(titleOf(named), said);
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
    for (const version of versions) {
      list.append(rowFor(version, current, title, language, show));
    }

    const footer = document.createElement('footer');
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'keep';
    done.textContent = words.close;
    done.addEventListener('click', handlers.onClose);
    footer.append(done);

    panel.replaceChildren(
      heading({ mark: 'versions', label: words.versionsTitle, name: title }, words.versionsNote),
      list,
      footer,
    );
    done.focus();
  }

  /** One copy, with both ways it differs from the active text marked in place. */
  function fillText(version: NoteVersion): void {
    const { pieces, unrelated } = diffParagraphs(version.text, current);
    const runs = runsOf(pieces);

    const body = document.createElement('div');
    body.className = 'review-text';
    body.append(...runs.map((run) => blockFor(run, words)));

    const aside = document.createElement('p');
    aside.className = 'review-note-aside';
    aside.textContent = words.versionUnrelated;
    aside.hidden = !unrelated;

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
      heading(
        { mark: 'versions', label: words.versionTitle, name: title },
        words.versionWhen(describeWhen(version.takenAt, language)),
      ),
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
