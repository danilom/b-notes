import { type Language, strings } from '../../language/wording.ts';
import type { LengthBands } from '../../notes/text-length.ts';
import type { NoteHandle } from '../../notes/note-handle.ts';
import type { Archive, ArchivedNote } from '../../notes/note.ts';
import type { Writing } from '../../notes/writing.ts';
import { type Log, describeError } from '../../platform/logging.ts';
import { openArchiveDialog } from './archive-dialog.ts';
import { archiveStripFor } from './archive-strip.ts';

export interface ArchivedParts {
  pane: HTMLDialogElement;
  /** The footnote under his list, which is there or is not. */
  strip: HTMLElement;
  stripLabel: HTMLElement;
  writing: Writing;
  log: Log;
  languageNow: () => Language;
  /** The titles already in his list, so the dialog can say which it has too. */
  liveTitlesNow: () => ReadonlySet<string>;
  queryNow: () => string;
  /**
   * The bands his list is drawn by, read at the moment he opens this.
   *
   * Asked for rather than handed over once: they are worked out afresh
   * whenever his texts change, and a copy taken when the app started would
   * be measuring him against the man he was that morning.
   */
  lengthsNow: () => LengthBands;
  refresh: () => Promise<void>;
  openText: (handle: NoteHandle) => Promise<void>;
  say: (notice: string) => void;
}

export interface ArchivedTexts {
  /** Count the archives without reading what is in them. */
  read(): Promise<void>;
  /** Paint the footnote from what was last counted. */
  drawStrip(): void;
  /** Open the archive at once, and read it while it is open. */
  show(): void;
}

/**
 * The texts set aside in an archive, and the way one comes back.
 *
 * Counted at startup and read only when he asks: an import is mostly older
 * copies of what he already has, and reading six hundred of them before his
 * writing appears would spend that second on the one thing he did not ask for.
 */
/**
 * Once what was just put on screen has been drawn: after the next frame, and
 * then a turn of the loop so the frame is out. With a timer as well, so a
 * window that draws no frames — hidden behind another — does not wait forever.
 */
function onScreen(): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 100);
    requestAnimationFrame(() => {
      setTimeout(() => {
        clearTimeout(timer);
        resolve();
      }, 0);
    });
  });
}

export function createArchivedTexts(parts: ArchivedParts): ArchivedTexts {
  const { pane, strip, stripLabel, writing, log } = parts;

  // A second press while it is reading finds the dialog already open, which
  // is what stops the archive being read twice.
  let archives: Archive[] = [];

  function drawStrip(): void {
    const shape = archiveStripFor(archives, parts.languageNow());
    stripLabel.textContent = shape.label;
    strip.hidden = !shape.present;
  }

  async function bringBack(note: ArchivedNote): Promise<void> {
    const words = strings(parts.languageNow());
    // Anything still on its way to disk lands first. Bringing a text in can
    // rename the one he is in — it claims a name in his list — and a save
    // landing afterwards would write his open text back under the old name.
    await writing.flush();

    let back: NoteHandle;
    try {
      back = await writing.bringBack(note.archive, note.id);
      archives = await writing.archives();
      await parts.refresh();
    } catch (error: unknown) {
      parts.say(words.archiveNotBrought);
      log.error('Could not bring a text in from the archive', {
        archive: note.archive,
        id: note.id,
        failure: describeError(error),
      });
      return;
    }

    log.info('Brought a text in from the archive', {
      archive: note.archive,
      from: note.id,
      id: back,
    });
    parts.say(words.archiveBrought);
    await parts.openText(back);
  }

  /**
   * Opens the archive, and reads it while it is open.
   *
   * The one place in the app that goes to disk because he pressed something,
   * and on a first run that is thousands of files and some seconds. So the
   * dialog is there at once, saying it is reading, rather than the button he
   * pressed looking as though it did nothing — which is a button he presses
   * again.
   */
  function show(): void {
    if (pane.open) return;
    const words = strings(parts.languageNow());

    // Not until the dialog is on screen. Started first, the reading did its
    // first stretch of work before the window could be drawn, and the
    // spinner that was to show it had started never appeared.
    const reading = onScreen()
      .then(() => writing.archived(parts.liveTitlesNow()))
      .then((found) => {
        log.info('Looked at the archive', { count: found.length, archives: archives.length });
        return found;
      });
    const close = openArchiveDialog(
      pane,
      { archived: reading, query: parts.queryNow(), lengths: parts.lengthsNow() },
      parts.languageNow(),
      {
        onClose: () => {
          close();
          // Back to the strip he came in by, which is the control now.
          strip.focus();
        },
        onBringBack: (note: ArchivedNote) => {
          close();
          void bringBack(note);
        },
        // A folder that is there and will not open. He gets a line he can
        // read over the telephone; the reason goes where it can be looked at.
        onUnreadable: (error: unknown) => {
          close();
          strip.focus();
          parts.say(words.archiveUnreadable);
          log.error('Could not read the archive', describeError(error));
        },
      },
    );
  }

  return {
    async read(): Promise<void> {
      archives = await writing.archives();
    },

    drawStrip,
    show,
  };
}
