import { type Shown, showAsModal } from '../parts/modal.ts';
import { type Language, describeWhen, strings } from '../../language/wording.ts';
import type { NoteVersion } from '../../notes/note.ts';
import { type DiffPiece, type DiffRun, diffParagraphs, runsOf } from '../../notes/paragraph-diff.ts';
import { icon } from '../parts/icons.ts';
import { scrollShowing } from './change-in-view.ts';
import { createStepper } from '../parts/stepper.ts';
import { type Titled, titleOf } from '../parts/dialog-heading.ts';
import { beginningAndEnd } from '../parts/text-snippet.ts';
import { countWords } from '../../notes/word-count.ts';
import { type VersionInList, describeVersion } from './version-row.ts';

export interface VersionsHandlers {
  /** Put this text in front of him. The save that follows keeps what was there. */
  onRestore: (version: NoteVersion) => void;
  onClose: () => void;
}

/**
 * The head of the index: his text as it stands.
 *
 * A row, so it can be looked at like any other — but visibly not one of the
 * copies. It carries no number, because it is not one of the things the
 * numbers count; it sits flush where their numbers do, so the difference is
 * the first thing about it; and it says nothing about how it compares, having
 * nothing to compare itself to.
 */
function activeRowFor(current: string, language: Language, show: () => void): HTMLButtonElement {
  const words = strings(language);

  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'index-row index-row-active';

  const line = document.createElement('span');
  line.className = 'index-line';

  const name = document.createElement('span');
  name.className = 'index-size';
  name.textContent = words.activeText;

  const size = document.createElement('span');
  size.className = 'index-when';
  size.textContent = words.versionWords(countWords(current));

  line.append(name, size);
  row.append(line);
  row.addEventListener('click', show);
  return row;
}

/**
 * One row of the index, and nothing more than a place in it.
 *
 * Two lines: what it is, and the one thing about it worth a second line. What
 * it says is no longer trying to be a reason to pick it — the diff beside it is
 * that.
 */
function rowFor(about: VersionInList, language: Language, show: () => void): HTMLButtonElement {
  const said = describeVersion(about, language);

  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'index-row';

  if (said.wasActive !== null) {
    const mark = document.createElement('span');
    mark.className = 'index-was-active';
    mark.textContent = said.wasActive;
    row.append(mark);
  }

  const top = document.createElement('span');
  top.className = 'index-line';

  if (said.number !== null) {
    const which = document.createElement('span');
    which.className = 'row-number';
    which.textContent = said.number;
    top.append(which);
  }

  const size = document.createElement('span');
  size.className = 'index-size';
  size.textContent = said.size;

  const when = document.createElement('span');
  when.className = 'index-when';
  when.textContent = said.when;

  top.append(size, when);
  row.append(top);

  if (said.note !== null) {
    const note = document.createElement('span');
    note.className = 'index-note';
    note.textContent = said.note;
    row.append(note);
  }

  row.addEventListener('click', show);
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
    plain.append(...run.pieces.map((piece) => paragraphOf(piece.text)));
    return plain;
  }

  const block = document.createElement('div');
  block.className = `review-run review-run-${run.kind}`;
  block.append(tagFor(run.kind, words), ...run.pieces.map(paragraphFor));
  return block;
}

function tagFor(kind: DiffRun['kind'], words: ReturnType<typeof strings>): HTMLElement {
  const said = {
    added: [words.versionAddedTag, words.versionAddedWhy],
    missing: [words.versionMissingTag, words.versionMissingWhy],
    changed: [words.versionChangedTag, words.versionChangedWhy],
    same: ['', ''],
  }[kind];

  const tag = document.createElement('span');
  tag.className = 'review-tag';

  const why = document.createElement('span');
  why.className = 'review-tag-why';
  why.textContent = said[1] ?? '';

  tag.append(`${said[0] ?? ''} `, why);
  return tag;
}

function paragraphFor(piece: DiffPiece): HTMLParagraphElement {
  if (piece.kind === 'changed') return rewordedOf(piece.words);
  if (piece.kind === 'missing') return shortenedOf(piece.text);
  return paragraphOf(piece.text);
}

function paragraphOf(text: string): HTMLParagraphElement {
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  return paragraph;
}

/** One paragraph shown once, with only the words that changed marked. */
function rewordedOf(words: readonly { kind: string; text: string }[]): HTMLParagraphElement {
  const paragraph = document.createElement('p');

  for (const word of words) {
    if (word.kind === 'same') {
      paragraph.append(`${word.text} `);
      continue;
    }
    const marked = document.createElement('span');
    marked.className = word.kind === 'added' ? 'word-gone' : 'word-new';
    marked.textContent = word.text;
    paragraph.append(marked, ' ');
  }
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
/** The text this dialog is about, and what is kept of it. */
export interface VersionsOf {
  title: string;
  versions: readonly NoteVersion[];
  /** His text as it stands, which every copy is read against. */
  current: string;
  /**
   * The copy made of what he had, if a restore in this sitting made one.
   *
   * Held by the caller for as long as the app runs rather than written down
   * anywhere: it says where he was a moment ago, which is a fact about this
   * sitting and not about the file.
   */
  previouslyActive: string | null;
}

export function openVersionsDialog(
  container: HTMLDialogElement,
  { title, versions, current, previouslyActive }: VersionsOf,
  language: Language,
  handlers: VersionsHandlers,
): () => void {
  const words = strings(language);
  /** The copy in front of him, and which row of the list it came from. */
  let showing: { version: NoteVersion; at: number } | null = null;

  /**
   * Escape closes, with nothing to back out to first.
   *
   * It used to step back to the list, which was a screen of its own. The list
   * is beside him now, so the only way out of this dialog is out.
   */
  /** The open dialog, once it is open. */
  let modal: Shown | null = null;

  const close = (): void => {
    modal?.close();
  };

  const panel = document.createElement('div');
  panel.className = 'panel review-panel versions-panel';
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

  const index = document.createElement('div');
  index.className = 'review-index';

  const preview = document.createElement('div');
  preview.className = 'review-preview';

  const body = document.createElement('div');
  body.className = 'review-panes';
  body.append(index, preview);

  const said = document.createElement('p');
  said.className = 'review-note';
  said.textContent = words.versionsNote;

  /**
   * What the index lists: his text as it stands, and then the copies of it.
   *
   * The active text is in the list because every row under it counts itself
   * against "sada" — the reference for the whole column, and until it was put
   * here, the one thing in the dialog he could not see.
   */
  const entries: (NoteVersion | null)[] = [null, ...versions];

  const rows = entries.map((version, at) =>
    version === null
      ? activeRowFor(current, language, () => select(0))
      : rowFor(
          {
            version,
            current,
            currentTitle: title,
            at: { row: at, of: versions.length },
            restoredFrom: version.id === previouslyActive,
          },
          language,
          () => select(at),
        ),
  );
  index.append(...rows);

  function stepper(body: HTMLElement): HTMLElement {
    const changes = [...body.querySelectorAll<HTMLElement>('.review-run')];

    let showing = 0;
    const steps = createStepper(
      { previous: words.changePrevious, next: words.changeNext },
      { onPrevious: () => goTo(showing - 1), onNext: () => goTo(showing + 1) },
    );
    steps.root.classList.add('review-steps');
    // Held back until it is known whether there is anywhere to go, which needs
    // the panel laid out. Hidden is the safe state to start in.
    steps.root.hidden = true;

    function goTo(which: number): void {
      showing = Math.max(0, Math.min(which, changes.length - 1));
      steps.showing(words.changeAt(showing + 1, changes.length), {
        canGoBack: showing > 0,
        canGoOn: showing < changes.length - 1,
      });

      const change = changes[showing];
      if (change === undefined) return;
      body.scrollTop = scrollShowing(
        { top: change.offsetTop - body.offsetTop, height: change.offsetHeight },
        { height: body.clientHeight, scrollable: body.scrollHeight - body.clientHeight },
      );
    }

    // After the panel is in the document, or every measurement here is zero.
    queueMicrotask(() => {
      // A copy short enough to read without scrolling has nothing to steer
      // through: he can see all of it, and a stepper over it is chrome.
      if (changes.length === 0 || body.scrollHeight <= body.clientHeight) return;
      steps.root.hidden = false;
      goTo(0);
    });
    return steps.root;
  }

  /** One copy, with both ways it differs from the active text marked in place. */
  /**
   * Puts one copy in the right-hand pane.
   *
   * The list stays where it is. That is the whole point of the two panes: he
   * goes through three copies looking for the one he wants, and going back is
   * not a journey — the place he would go back to never left the screen.
   */
  /** @param version The copy to show, or null for his text as it stands. */
  function fillPreview(version: NoteVersion | null): void {
    const { pieces, unrelated } = diffParagraphs(version?.text ?? current, current);
    const runs = runsOf(pieces);

    const text = document.createElement('div');
    text.className = 'review-text';
    text.append(...runs.map((run) => blockFor(run, words)));

    const aside = document.createElement('p');
    aside.className = 'review-note-aside';
    aside.textContent = words.versionUnrelated;
    aside.hidden = !unrelated;

    // Which copy this is and what the box is, against the box. Both are facts
    // about the thing underneath them, and the line under the title is for
    // what he is here to do.
    const about = document.createElement('p');
    about.className = 'review-note-aside';
    about.textContent =
      version === null
        ? words.activeTextNow
        : words.versionWhen(describeWhen(version.takenAt, language));

    // The stepper floats over the box, so the box is what it is placed
    // against. Hung on the column instead, it lands on whatever lines are
    // above the box — and how many of those there are varies.
    const framed = document.createElement('div');
    framed.className = 'review-framed';
    framed.append(text, stepper(text));

    const column = document.createElement('div');
    column.className = 'review-body';
    column.append(aside, about, framed);

    preview.replaceChildren(column);
  }

  function select(at: number): void {
    if (at < 0 || at >= entries.length) return;
    const version = entries[at] ?? null;

    showing = version === null ? null : { version, at };
    rows.forEach((one, row) => {
      one.classList.toggle('row-open', row === at);
      one.setAttribute('aria-current', row === at ? 'true' : 'false');
    });

    // Nothing to bring back from the text he already has. The button goes
    // quiet rather than away, and the note beside it — which describes a
    // replacement that would not happen — goes with it.
    back.disabled = version === null;
    says.hidden = version === null;

    fillPreview(version);
  }

  const footer = document.createElement('footer');

  // What the button is about to do, in the two halves he would ask about:
  // where this goes, and where what he has now goes.
  const says = document.createElement('p');
  says.className = 'footer-note';
  for (const line of [words.versionRestoreNote, words.versionRestoreKept]) {
    const one = document.createElement('span');
    one.textContent = line;
    says.append(one);
  }

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'keep';
  back.textContent = words.versionRestore;
  back.addEventListener('click', () => {
    if (showing !== null) handlers.onRestore(showing.version);
  });

  const done = document.createElement('button');
  done.type = 'button';
  done.textContent = words.close;
  done.addEventListener('click', handlers.onClose);

  footer.append(says, back, done);

  const header = document.createElement('header');
  const stacked = document.createElement('div');
  stacked.className = 'review-heading';
  stacked.append(titleOf({ mark: 'versions', label: words.versionsTitle, name: title }), said);
  header.append(stacked, dismissButton());

  panel.replaceChildren(header, body, footer);
  // The newest, so he opens on a difference rather than on an empty half.
  select(1);

  modal = showAsModal(container, panel, () => handlers.onClose());
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
