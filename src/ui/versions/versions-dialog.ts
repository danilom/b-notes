import { type Shown, showAsModal } from '../dialogs/modal.ts';
import { type Language, describeWhen, strings } from '../../language/wording.ts';
import type { NoteVersion } from '../../notes/note.ts';
import { diffParagraphs } from '../../notes/paragraph-diff.ts';
import { type TextPiece, diffTexts, mergeCloseChanges, separateTidying } from '../../notes/text-diff.ts';
import { createDiffLegend } from '../diff-legend.ts';
import { createTextDiffView } from '../diff-view.ts';
import { icon } from '../icons.ts';
import { type Titled, titleOf } from '../dialogs/dialog-heading.ts';
import { countWords } from '../../notes/word-count.ts';
import { type LengthBands, bandOf, bytesOf } from '../../notes/text-length.ts';
import { pageGlyph } from '../page-glyph.ts';
import { type VersionInList, describeVersion } from './version-row.ts';

export interface VersionsHandlers {
  /** Put this text in front of him. The save that follows keeps what was there. */
  onRestore: (version: NoteVersion) => void;
  onClose: () => void;
}

/**
 * Everything a row says, held together so the page can sit beside all of it.
 *
 * A row here is two or three lines deep, where his list's is one. Without this
 * the page would be another item on the first line, level with the word count
 * and above whatever the second line says — beside part of the row instead of
 * beside the row.
 */
function bodyOf(...lines: readonly HTMLElement[]): HTMLElement {
  const body = document.createElement('span');
  body.className = 'index-body';
  body.append(...lines);
  return body;
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
function activeRowFor(
  current: string,
  lengths: LengthBands,
  language: Language,
  show: () => void,
): HTMLButtonElement {
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
  row.append(pageGlyph(bandOf(bytesOf(current), lengths)), bodyOf(line));
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
function rowFor(
  about: VersionInList,
  lengths: LengthBands,
  language: Language,
  show: () => void,
): HTMLButtonElement {
  const said = describeVersion(about, language);

  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'index-row';

  const body = bodyOf();

  if (said.wasActive !== null) {
    const mark = document.createElement('span');
    mark.className = 'index-was-active';
    mark.textContent = said.wasActive;
    body.append(mark);
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
  body.append(top);

  if (said.note !== null) {
    const note = document.createElement('span');
    note.className = 'index-note';
    note.textContent = said.note;
    body.append(note);
  }

  row.append(pageGlyph(bandOf(bytesOf(about.version.text), lengths)), body);
  row.addEventListener('click', show);
  return row;
}

/**
 * A copy read against his text, as the AI Lektor's corrections are read against it:
 * one text, with each place the two differ marked where it falls, word by word. The
 * copy is the older of the two, so what it had that his text has lost is struck out in
 * red, and what his text has now is green. Only to read: there is nothing to choose
 * here, and bringing a copy back is the button below.
 *
 * A diacritic counts as a small difference whichever text has it. This is for seeing
 * roughly what changed, and copies get pasted and taken back, so neither side is the
 * one whose diacritics are right.
 */
function copyAgainstText(copy: string, current: string): TextPiece[] {
  return mergeCloseChanges(separateTidying(diffTexts(copy, current), { diacriticsEitherWay: true }));
}

/** What each mark means in this panel, drawn as it is in the text. */
function versionLegend(words: ReturnType<typeof strings>): HTMLElement {
  const { was, now, small } = words.versionLegend;
  return createDiffLegend(
    [
      { sample: 'old', said: was },
      { sample: 'proposed', said: now },
      { sample: 'small', said: small },
    ],
    words.legendSample,
  );
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
  /**
   * The bands his list is drawn by, so a copy's page can be read against the
   * pages he was just looking at.
   *
   * Not worked out from the copies of this one text, which would say how this
   * text has grown — a different question, and one the word counts beside them
   * already answer.
   */
  lengths: LengthBands;
}

export function openVersionsDialog(
  container: HTMLDialogElement,
  { title, versions, current, previouslyActive, lengths }: VersionsOf,
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
      ? activeRowFor(current, lengths, language, () => select(0))
      : rowFor(
          {
            version,
            current,
            currentTitle: title,
            at: { row: at, of: versions.length },
            restoredFrom: version.id === previouslyActive,
          },
          lengths,
          language,
          () => select(at),
        ),
  );
  index.append(...rows);

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
    // Paragraph by paragraph only to tell a copy of some other text from one of this one.
    const { unrelated } = diffParagraphs(version?.text ?? current, current);

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

    const compared = copyAgainstText(version?.text ?? current, current);
    const differs = compared.some((piece) => piece.kind !== 'same');

    const column = document.createElement('div');
    column.className = 'review-body';
    column.append(
      aside,
      about,
      ...(differs ? [versionLegend(words)] : []),
      createTextDiffView(compared, { previous: words.changePrevious, next: words.changeNext, at: words.changeAt }, { showTidied: true }),
    );

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
