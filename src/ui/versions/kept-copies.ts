import { type Language, strings } from '../../language/wording.ts';
import type { LengthBands } from '../../notes/text-length.ts';
import { NO_NOTE, type NoNote, type NoteHandle } from '../../notes/note-handle.ts';
import type { Writing } from '../../notes/writing.ts';
import { type Log, describeError } from '../../platform/logging.ts';
import { type KeptCopies, keptOf } from '../status-line.ts';
import { versionsWorthShowing } from './version-row.ts';
import { openVersionsDialog } from './versions-dialog.ts';

/** Which text is in front of him, as this needs to know it. */
export interface OpenText {
  handle: NoteHandle | NoNote;
  /** Where it lives now, or null before it has a file. */
  name: string | null;
  title: string;
}

export interface KeptCopiesParts {
  pane: HTMLDialogElement;
  button: HTMLButtonElement;
  label: HTMLElement;
  /** His writing, which is compared against the copies and replaced by one. */
  editor: HTMLTextAreaElement;
  writing: Writing;
  log: Log;
  /** Asked each time: both are his to change while the app is open. */
  languageNow: () => Language;
  openTextNow: () => OpenText;
  /** The bands his list is drawn by, read at the moment he opens this. */
  lengthsNow: () => LengthBands;
  /** Something to tell him once, said where he reads such things. */
  say: (notice: string) => void;
  /**
   * A copy becomes his text.
   *
   * Handed out rather than done here: replacing what is in the editor is the
   * interface's business — the caret, the marks behind it, the save that
   * follows — and this knows only that it should happen.
   */
  putInEditor: (text: string) => void;
}

export interface KeptCopiesView {
  /** Ask the disk how many copies the open text has, and show the way to them. */
  count(): Promise<void>;
  /** Repaint the button from what was last counted. */
  showButton(): void;
  /** Open the dialog, unless there is nothing in it worth showing. */
  show(): void;
}

/**
 * The copies kept of a text, counted on a button and shown in a dialog.
 *
 * It owns the two things nothing else touched: what was last counted and for
 * which text, and which copy he last brought back. Everything else it needs is
 * handed in, so that what this reaches for is a list rather than whatever
 * happens to be in scope.
 */
export function createKeptCopies(parts: KeptCopiesParts): KeptCopiesView {
  const { pane, button, label, editor, writing, log } = parts;

  let kept: KeptCopies = { note: NO_NOTE, count: 0 };
  /** The copy made on his behalf before a version replaced his text. */
  let restored: { note: string; version: string } | null = null;

  function showButton(): void {
    /*
      The count, not merely the way in. Whether a text has copies kept of it is
      something he otherwise cannot find out without opening the thing that
      shows them, and the number belongs where that question gets asked.

      Zero is written out like any other. A figure that appears only once it is
      above zero is one he has to have seen before to know what its absence
      means — and the first thing he needs to learn here is that the app keeps
      copies at all.
    */
    const count = keptOf(parts.openTextNow().handle, kept);
    label.textContent = `${strings(parts.languageNow()).versions} (${count})`;
    button.disabled = count === 0;
  }

  async function count(): Promise<void> {
    const asking = parts.openTextNow().handle;
    let howMany = 0;
    if (asking !== NO_NOTE) {
      try {
        howMany = await writing.countVersions(asking);
      } catch (error: unknown) {
        // The number on a button is not worth failing a startup over, but it
        // is worth saying so: a text whose copies cannot be counted has
        // something wrong with it.
        log.warn('Could not count the copies kept of a text', {
          id: asking,
          failure: describeError(error),
        });
      }
    }
    /*
      He may have moved on while the disk was answering, in which case this
      answer is about a text he is no longer in and would displace a fresher
      one. Against the handle and not the name: those were comparable once, a
      number against a string, always unequal — so this always returned and the
      count was never set.
    */
    if (asking !== parts.openTextNow().handle) return;
    kept = { note: asking, count: howMany };
    showButton();
  }

  /**
   * Keeps a copy of what is there now, then puts the older one in its place.
   *
   * The copy first, and nothing happens if it fails. Replacing his text is a
   * deliberate act with its own way back — the copy kept below — and offering
   * that way back is a promise this has to be able to keep.
   */
  async function bringBack(text: string): Promise<void> {
    const words = strings(parts.languageNow());
    const open = parts.openTextNow();
    if (open.name === null || open.handle === NO_NOTE) return;

    try {
      restored = { note: open.name, version: await writing.keepCopy(open.handle, editor.value) };
    } catch (failure) {
      log.error('Could not keep a copy before bringing a version back', { id: open.name, failure });
      parts.say(words.notRestored);
      return;
    }

    parts.putInEditor(text);
    parts.say(words.restored);
    log.info('Brought an earlier version back', { id: parts.openTextNow().name });
  }

  function show(): void {
    const open = parts.openTextNow();
    if (pane.open || open.name === null || open.handle === NO_NOTE) return;
    const words = strings(parts.languageNow());
    const { handle, name } = open;

    void (async () => {
      // A copy that matches his text exactly is not worth offering, and the
      // count on the button cannot know that without reading every file, so
      // the button can be there with nothing behind it. Saying so is better
      // than a press that does nothing.
      const versions = versionsWorthShowing(await writing.versionsOf(handle), editor.value);
      if (versions.length === 0) {
        parts.say(words.versionsAllSame);
        return;
      }

      log.info('Looked at the copies kept of a text', { id: name, copies: versions.length });
      const close = openVersionsDialog(
        pane,
        {
          title: open.title,
          versions,
          current: editor.value,
          previouslyActive: restored?.note === name ? restored.version : null,
          lengths: parts.lengthsNow(),
        },
        parts.languageNow(),
        {
          onClose: () => {
            close();
            button.focus();
          },
          onRestore: (version) => {
            close();
            void bringBack(version.text);
          },
        },
      );
    })();
  }

  return { count, showButton, show };
}
