import { type Language, strings } from '../../language/wording.ts';
import type { LengthBands } from '../../notes/text-length.ts';
import type { NoteHandle } from '../../notes/note-handle.ts';
import type { DeletedNote } from '../../notes/note.ts';
import type { Writing } from '../../notes/writing.ts';
import { type Log, describeError } from '../../platform/logging.ts';
import { openConfirmDialog } from '../dialogs/confirm-dialog.ts';
import { openDeletedDialog } from './deleted-dialog.ts';
import { deletedStripFor } from './deleted-strip.ts';
import { confirmationForDestroying } from './note-confirmations.ts';

export interface PutAwayParts {
  pane: HTMLDialogElement;
  /** Where a question that cannot be undone is asked. */
  confirmPane: HTMLDialogElement;
  /** The strip under his list, and the parts of it that say how many. */
  strip: HTMLElement;
  stripLabel: HTMLElement;
  see: HTMLButtonElement;
  writing: Writing;
  log: Log;
  languageNow: () => Language;
  /** What he is searching for, which the strip and the dialog both narrow by. */
  queryNow: () => string;
  /**
   * The bands his list is drawn by, read at the moment he opens this.
   *
   * Asked for rather than handed over once: they are worked out afresh
   * whenever his texts change, and a copy taken when the app started would
   * be measuring him against the man he was that morning.
   */
  lengthsNow: () => LengthBands;
  /** Everything read again, because a text moved between two lists. */
  refresh: () => Promise<void>;
  /** A text is back in his list and should be in front of him. */
  openText: (handle: NoteHandle) => Promise<void>;
  say: (notice: string) => void;
}

export interface PutAwayTexts {
  /** How many he has put away, for the strip under his list. */
  countNow(): number;
  /** Read the put-away list again. */
  read(): Promise<void>;
  /** Paint the strip from what was last read. */
  drawStrip(): void;
  /** Open the list, if there is anything in it. */
  show(): void;
}

/**
 * The texts he has put away: the strip under his list, and what he can do
 * from it.
 *
 * Putting one away is not here — that is the open text leaving, which moves
 * the caret, the saved time and the session with it, and belongs where the
 * rest of that lives. This is the list of what has already gone, and the two
 * ways out of it: back into his writing, or gone for good.
 */
export function createPutAwayTexts(parts: PutAwayParts): PutAwayTexts {
  const { pane, confirmPane, strip, stripLabel, see, writing, log } = parts;

  let deleted: DeletedNote[] = [];

  function drawStrip(): void {
    const shape = deletedStripFor(deleted, parts.queryNow(), parts.languageNow());
    stripLabel.textContent = shape.label;
    see.disabled = !shape.canOpen;
    // The whole strip is the target, so the whole strip has to go quiet with
    // the button: the cursor and the hover are what promise there is something
    // here.
    strip.classList.toggle('dead', !shape.canOpen);
  }

  async function destroy(id: string, closeList: () => void): Promise<void> {
    const words = strings(parts.languageNow());
    try {
      await writing.destroy(id);
      await parts.refresh();
    } catch (error: unknown) {
      // Out of the dialog first, or the line saying so would be behind it.
      // What he was destroying is still in the list, which is the safe way to
      // fail.
      closeList();
      parts.say(words.notDestroyed);
      log.error('Could not destroy a text', describeError(error));
      return;
    }
    log.warn('Destroyed a text for good', { id });

    // Back among the rest of them, since he is probably clearing several —
    // unless that was the last one, in which case there is nothing to return
    // to.
    closeList();
    if (deleted.length > 0) show();
    else see.focus();
  }

  function askToDestroy(note: DeletedNote, closeList: () => void): void {
    const close = openConfirmDialog(
      confirmPane,
      {
        ...confirmationForDestroying(note, parts.languageNow()),
        onConfirm: () => {
          close();
          void destroy(note.id, closeList);
        },
        onCancel: () => {
          close();
        },
      },
      parts.languageNow(),
    );
  }

  async function bringBack(id: string): Promise<void> {
    const words = strings(parts.languageNow());
    /*
      Anything still on its way to disk lands first, exactly as putting a text
      away does. Bringing one back can rename the text he is *in* — it takes
      the bare name, so the one already holding it is numbered — and a save
      that fired afterwards would write his open text back under the name it no
      longer has, leaving two copies of it in his list.
    */
    await writing.flush();

    let back: NoteHandle;
    try {
      back = await writing.restore(id);
      await parts.refresh();
    } catch (error: unknown) {
      // The dialog has already closed, so the line is his to read.
      parts.say(words.notRestored);
      log.error('Could not bring a text back', describeError(error));
      return;
    }

    parts.say(words.restored);
    await parts.openText(back);
    log.info('Brought a text back', { id, back });
  }

  function show(): void {
    if (pane.open) return;

    log.info('Looked at the texts he has put away', { count: deleted.length });
    const close = openDeletedDialog(
      pane,
      { deleted, query: parts.queryNow(), lengths: parts.lengthsNow() },
      parts.languageNow(),
      {
        onClose: () => {
          close();
          see.focus();
        },
        onRestore: (id: string) => {
          close();
          void bringBack(id);
        },
        onDestroy: (note: DeletedNote) => {
          askToDestroy(note, close);
        },
      },
    );
  }

  return {
    countNow: () => deleted.length,

    async read(): Promise<void> {
      deleted = await writing.putAway();
    },

    drawStrip,
    show,
  };
}
